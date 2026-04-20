/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Manage Google OAuth token refreshing per provider
 * DB Tables Used  : providers
 * Concurrency Risk: LOW — row-level UPDATE on refresh
 * GCal Calls      : YES — Google OAuth token endpoint
 * Idempotency Key : N/A
 * RLS Tenant ID   : YES — requires provider_id for update
 * Zod Schemas     : YES — TokenResponseSchema validates Google API output
 */

import { z } from 'zod';
import postgres from 'postgres';
import type { Result } from '../result/index';

type Sql = postgres.Sql;

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
});

interface TokenInfo {
  readonly accessToken: string;
  readonly clientId: string | null;
  readonly clientSecret: string | null;
  readonly refreshToken: string | null;
}

/**
 * Ensures a valid access token is available. 
 * If the current one is likely expired (or missing), attempts a refresh.
 */
export async function getValidAccessToken(
  providerId: string,
  current: TokenInfo,
  sql: Sql
): Promise<Result<string>> {
  // If we have an access token and NO refresh token, we must use what we have (legacy/env mode)
  if (current.accessToken && !current.refreshToken) {
    return [null, current.accessToken];
  }

  // If we have credentials, try to refresh
  if (current.clientId && current.clientSecret && current.refreshToken) {
    const [refreshErr, newToken] = await refreshAccessToken(
      current.clientId,
      current.clientSecret,
      current.refreshToken
    );

    if (refreshErr !== null || newToken === null) {
      // If refresh fails, fallback to current token as last resort
      if (current.accessToken) return [null, current.accessToken];
      return [refreshErr ?? new Error('Failed to refresh token and no current token available'), null];
    }

    // Persist new token if possible
    await persistNewToken(sql, providerId, newToken).catch(e => {
      console.error(`[OAuth] Failed to persist new token for provider ${providerId}:`, e);
    });

    return [null, newToken];
  }

  // Fallback to current
  if (current.accessToken) return [null, current.accessToken];
  
  return [new Error('No valid GCal credentials available for provider'), null];
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<Result<string>> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return [new Error(`Google OAuth refresh failed: ${errText}`), null];
    }

    const data = await response.json();
    const parsed = TokenResponseSchema.safeParse(data);
    if (!parsed.success) {
      return [new Error(`Invalid token response: ${parsed.error.message}`), null];
    }

    return [null, parsed.data.access_token];
  } catch (e) {
    return [e instanceof Error ? e : new Error(String(e)), null];
  }
}

async function persistNewToken(sql: Sql, providerId: string, token: string): Promise<void> {
  // Use a raw query to bypass RLS if we are in a background context, 
  // or trust the caller to be in the right context.
  // Given our architecture, gcal_sync/reconcile use withTenantContext.
  await sql`
    UPDATE providers 
    SET gcal_access_token = ${token},
        updated_at = NOW()
    WHERE provider_id = ${providerId}::uuid
  `;
}
