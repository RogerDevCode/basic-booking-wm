import { z } from "zod";
import "@total-typescript/ts-reset";
import { Result, ok, err } from "../../internal/types/domain";
import nodemailer from "nodemailer";

// ============================================================================
// SSOT STRICT TYPING DEFINITIONS
// ============================================================================

export const GmailSendInputSchema = z.object({
  to_email: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  is_html: z.boolean().nullish().transform(v => v ?? false),
  to_name: z.string().nullish().transform(v => v ?? null),
  cc_emails: z.string().nullish().transform(v => v ?? null),
  bcc_emails: z.string().nullish().transform(v => v ?? null),
  reply_to_email: z.string().email().nullish().transform(v => v ?? null),
}).strict();

export type GmailSendInput = z.infer<typeof GmailSendInputSchema>;

export const GmailResourceSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  smtp_host: z.string().nullish().transform(v => v ?? "smtp.gmail.com"),
  smtp_port: z.number().int().nullish().transform(v => v ?? 465),
  from_email: z.string().nullish().transform(v => v ?? null),
  from_name: z.string().nullish().transform(v => v ?? "Booking Titanium"),
}).strict();

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function main(
  rawInput: unknown,
  rawResource: unknown
): Promise<Result<{ readonly message_id: string; readonly accepted: readonly string[] }>> {
  
  // 1. Boundary Validation
  const inputParsed = GmailSendInputSchema.safeParse(rawInput);
  if (!inputParsed.success) {
    return err(new Error(`Invalid input: ${inputParsed.error.message}`));
  }

  const resourceParsed = GmailResourceSchema.safeParse(rawResource);
  let config: z.infer<typeof GmailResourceSchema>;
  
  if (resourceParsed.success) {
    config = resourceParsed.data;
  } else {
    // Fallback to process.env
    const envUser = process.env.GMAIL_USER ?? process.env.DEV_LOCAL_GMAIL_USER;
    const envPass = process.env.GMAIL_PASSWORD ?? process.env.DEV_LOCAL_GMAIL_PASS;
    
    if (!envUser || !envPass) {
      return err(new Error("Gmail credentials not configured in resource or environment"));
    }
    
    config = {
      username: envUser,
      password: envPass,
      smtp_host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      smtp_port: process.env.SMTP_PORT ? Number.parseInt(process.env.SMTP_PORT, 10) : 465,
      from_email: process.env.GMAIL_FROM_EMAIL ?? envUser,
      from_name: process.env.GMAIL_FROM_NAME ?? "Booking Titanium"
    };
  }

  const input = inputParsed.data;
  
  const fromEmail = config.from_email ?? config.username;
  const fromHeader = config.from_name ? `"${config.from_name}" <${fromEmail}>` : fromEmail;
  const toHeader = input.to_name ? `"${input.to_name}" <${input.to_email}>` : input.to_email;

  const mailOptions: nodemailer.SendMailOptions = {
    from: fromHeader,
    to: toHeader,
    subject: input.subject,
  };

  if (input.is_html) {
    mailOptions.html = input.body;
  } else {
    mailOptions.text = input.body;
  }

  if (input.cc_emails !== null) {
    mailOptions.cc = parseEmailList(input.cc_emails).join(", ");
  }

  if (input.bcc_emails !== null) {
    mailOptions.bcc = parseEmailList(input.bcc_emails).join(", ");
  }

  if (input.reply_to_email !== null) {
    mailOptions.replyTo = input.reply_to_email;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_port === 465,
    auth: {
      user: config.username,
      pass: config.password,
    },
  });

  // 2. Execution with Retries
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await attemptSend(transporter, mailOptions);
    
    if (result.success) {
      return ok(result.data);
    }

    lastError = result.error;

    if (isPermanentGmailError(lastError.message)) {
      return err(lastError);
    }

    if (attempt < MAX_RETRIES - 1) {
      const backoffMs = Math.pow(3, attempt) * 1000;
      await new Promise(res => setTimeout(res, backoffMs));
    }
  }

  return err(new Error(`Failed to send Gmail message after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function attemptSend(
  transporter: nodemailer.Transporter, 
  mailOptions: nodemailer.SendMailOptions
): Promise<Result<{ readonly message_id: string; readonly accepted: readonly string[] }>> {
  try {
    const info = await transporter.sendMail(mailOptions);
    return ok({
      message_id: info.messageId,
      accepted: info.accepted.map(String)
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

function parseEmailList(emails: string): string[] {
  if (!emails) return [];
  return emails
    .split(",")
    .map(e => e.trim())
    .filter(e => e.length > 0);
}

function isPermanentGmailError(errorMessage: string): boolean {
  const msgLower = errorMessage.toLowerCase();
  return msgLower.includes("authentication") || 
         msgLower.includes("535") || 
         msgLower.includes("quota") || 
         msgLower.includes("invalid credentials");
}
