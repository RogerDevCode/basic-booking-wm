# GCal Multi-Provider Credential Migration

## Problem
Google Calendar credentials were stored in `.env` as global variables (`GCAL_ACCESS_TOKEN`, `GCAL_PROVIDER_CALENDAR_ID`), which broke multi-provider isolation. All providers shared the same Google Calendar account.

## Solution
Credentials are now stored **per-provider** in the `providers` table. Each provider can have their own Google Calendar OAuth credentials.

## Schema Changes (Migration 014)

```sql
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS gcal_client_id TEXT,
  ADD COLUMN IF NOT EXISTS gcal_client_secret TEXT,
  ADD COLUMN IF NOT EXISTS gcal_access_token TEXT,
  ADD COLUMN IF NOT EXISTS gcal_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS gcal_email TEXT;
```

### Column Descriptions

| Column | Purpose | Sensitive? |
|--------|---------|------------|
| `gcal_client_id` | Google OAuth 2.0 Client ID | No |
| `gcal_client_secret` | Google OAuth 2.0 Client Secret | **Yes - encrypt at rest** |
| `gcal_access_token` | OAuth 2.0 Access Token (short-lived) | **Yes - encrypt at rest** |
| `gcal_refresh_token` | OAuth 2.0 Refresh Token | **Yes - encrypt at rest** |
| `gcal_email` | Google account email | No |
| `gcal_calendar_id` | Google Calendar ID (already existed) | No |

## Code Changes

### `f/gcal_sync/main.ts`
- `callGCalAPI()` now accepts `accessToken` as a parameter instead of reading `process.env['GCAL_ACCESS_TOKEN']`
- Booking SELECT now includes `p.gcal_access_token as provider_gcal_access_token`
- A helper `callWithProviderToken` wraps all GCal API calls with the provider's token
- **Backwards compatible**: Falls back to `process.env['GCAL_ACCESS_TOKEN']` if provider has no token

### Before
```typescript
async function callGCalAPI(method, path, calendarId, body?) {
  const accessToken = process.env['GCAL_ACCESS_TOKEN'];  // ❌ Global
  // ...
}
```

### After
```typescript
async function callGCalAPI(method, path, calendarId, accessToken, body?) {
  if (accessToken === '') {
    return { ok: false, error: 'GCal access token not provided' };
  }
  // ...
}

// In main():
const providerAccessToken = booking.provider_gcal_access_token 
  ?? process.env['GCAL_ACCESS_TOKEN']  // Backwards compatible
  ?? '';

const callWithProviderToken = (method, path, calId, body?) =>
  callGCalAPI(method, path, calId, providerAccessToken, body);
```

## Setup Per-Provider

1. **Create Google Cloud Project** (one per provider or shared)
2. **Enable Calendar API**
3. **Create OAuth 2.0 Credentials** (Client ID + Secret)
4. **OAuth Consent Screen** - Configure with Calendar scopes
5. **Get Access Token** - Use OAuth 2.0 flow to get access + refresh tokens
6. **Store in DB**:
```sql
UPDATE providers SET
  gcal_client_id = 'xxx.apps.googleusercontent.com',
  gcal_client_secret = 'GOCSPX-xxx',
  gcal_access_token = 'ya29.xxx',
  gcal_refresh_token = '1//xxx',
  gcal_email = 'provider@gmail.com',
  gcal_calendar_id = 'primary'  -- or specific calendar ID
WHERE provider_id = 'uuid';
```

## Security Notes

- **Sensitive columns** (`gcal_client_secret`, `gcal_access_token`, `gcal_refresh_token`) should be encrypted at rest
- Future migration will use `pgcrypto` or application-level encryption
- RLS policy already prevents cross-tenant access to provider data
- Tokens should be rotated periodically using `gcal_refresh_token`

## Backwards Compatibility

The system maintains backwards compatibility:
- If a provider has `gcal_access_token = NULL`, falls back to `GCAL_ACCESS_TOKEN` env var
- This allows gradual migration of providers without downtime
- New providers **must** have credentials stored in DB (no env var fallback for new setups)

## Files Modified

| File | Change |
|------|--------|
| `migrations/014_add_gcal_oauth_credentials.sql` | New migration |
| `f/gcal_sync/main.ts` | Refactored to use per-provider tokens |
| `docs/GCAL_MULTI_PROVIDER_MIGRATION.md` | This document |

## TODO

- [ ] Encrypt sensitive GCal columns at rest (`pgcrypto` or app-level)
- [ ] Implement automatic token refresh using `gcal_refresh_token`
- [ ] Add provider-facing UI for OAuth setup flow
- [ ] Remove `GCAL_ACCESS_TOKEN` from `.env` after all providers migrated
- [ ] Add token expiry monitoring and alerting
