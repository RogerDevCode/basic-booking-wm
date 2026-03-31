import { z } from "zod";
import "@total-typescript/ts-reset";
import { Result, ok, err } from "../../internal/types/domain";
import { google } from "googleapis";

// ============================================================================
// SSOT STRICT TYPING DEFINITIONS
// ============================================================================

export const GCalCreateInputSchema = z.object({
  start_time: z.string().datetime(),
  title: z.string().min(1),
  description: z.string().nullish().transform(v => v ?? ""),
  calendar_id: z.string().nullish().transform(v => v ?? "primary"),
}).strict();

export type GCalCreateInput = z.infer<typeof GCalCreateInputSchema>;

export const GCalResourceSchema = z.object({
  credentials_json: z.string().min(1),
}).strict();

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function main(
  rawInput: unknown,
  rawResource: unknown
): Promise<Result<{ readonly created: boolean; readonly event_id: string; readonly html_link: string }, Error>> {
  
  // 1. Boundary Validation
  const inputParsed = GCalCreateInputSchema.safeParse(rawInput);
  if (!inputParsed.success) {
    return err(new Error(`Invalid input: ${inputParsed.error.message}`));
  }

  const resourceParsed = GCalResourceSchema.safeParse(rawResource);
  let credentialsJson = "";
  if (resourceParsed.success) {
    credentialsJson = resourceParsed.data.credentials_json;
  } else {
    // Fallback to process.env
    const envJson = process.env.GOOGLE_CREDENTIALS_JSON;
    if (!envJson) {
      return err(new Error("Google Credentials JSON not configured in resource or environment"));
    }
    credentialsJson = envJson;
  }

  const input = inputParsed.data;

  // Calculate end_time (default 1 hour)
  const startTimeObj = new Date(input.start_time);
  const endTimeObj = new Date(startTimeObj.getTime() + 60 * 60000);

  // 2. Auth Client Initialization
  let auth;
  try {
    const credentials = JSON.parse(credentialsJson);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
  } catch (error) {
    return err(new Error("Failed to parse Google credentials JSON"));
  }

  const calendar = google.calendar({ version: "v3", auth });

  const eventRequestBody = {
    summary: input.title,
    description: input.description,
    start: {
      dateTime: startTimeObj.toISOString(),
      timeZone: "America/Mexico_City",
    },
    end: {
      dateTime: endTimeObj.toISOString(),
      timeZone: "America/Mexico_City",
    },
  };

  // 3. Execution with Retries (v4.0 LAW-15)
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await calendar.events.insert({
        calendarId: input.calendar_id,
        requestBody: eventRequestBody,
      });

      if (!response.data.id || !response.data.htmlLink) {
         return err(new Error("Google Calendar API returned incomplete event data"));
      }

      return ok({
        created: true,
        event_id: response.data.id,
        html_link: response.data.htmlLink,
      });

    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isPermanentGCalError(lastError.message)) {
        return err(lastError);
      }

      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = Math.pow(3, attempt) * 1000;
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }
  }

  return err(new Error(`Failed to create GCal event after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isPermanentGCalError(errorMessage: string): boolean {
  const msgLower = errorMessage.toLowerCase();
  
  // Checking for common 4xx errors except 429
  if (msgLower.includes("code: 400") || msgLower.includes("code: 401") || 
      msgLower.includes("code: 403") || msgLower.includes("code: 404")) {
    return true;
  }

  if (msgLower.includes("invalid credentials") || msgLower.includes("unauthorized")) {
    return true;
  }

  return false;
}
