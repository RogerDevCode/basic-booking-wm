import httpx
from typing import Optional, cast
from pydantic import BaseModel, ConfigDict
from .._result import Result, DBClient, ok, fail
from ._gcal_models import TokenInfo

class TokenResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    access_token: str
    expires_in: int
    token_type: str
    scope: Optional[str] = None
    refresh_token: Optional[str] = None

async def get_valid_access_token(
    provider_id: str,
    current: TokenInfo,
    db: DBClient
) -> Result[str]:
    # 1. Use existing if no refresh credentials
    if current["accessToken"] and not current["refreshToken"]:
        return ok(current["accessToken"])

    # 2. Try refresh if credentials exist
    if current["clientId"] and current["clientSecret"] and current["refreshToken"]:
        err, new_token = await refresh_access_token(
            current["clientId"],
            current["clientSecret"],
            current["refreshToken"]
        )

        if not err and new_token:
            # Persist new token (fire and forget-ish error handling)
            try:
                await persist_new_token(db, provider_id, new_token)
            except Exception as e:
                from .._wmill_adapter import log
                log(f"Failed to persist new token for {provider_id}", error=str(e), module="gcal_oauth")
            
            return ok(new_token)
        
        # Fallback to current if refresh fails
        if current["accessToken"]:
            return ok(current["accessToken"])
        
        return fail(err or "Failed to refresh token and no current token available")

    # 3. Last fallback
    if current["accessToken"]:
        return ok(current["accessToken"])
    
    return fail("No valid GCal credentials available for provider")

async def refresh_access_token(
    client_id: str,
    client_secret: str,
    refresh_token: str
) -> Result[str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                }
            )
            
            if response.status_code != 200:
                return fail(f"Google OAuth refresh failed: {response.text}")

            data = response.json()
            try:
                parsed = TokenResponse.model_validate(data)
                return ok(parsed.access_token)
            except Exception as e:
                return fail(f"Invalid token response: {e}")

    except Exception as e:
        return fail(e)

async def persist_new_token(db: DBClient, provider_id: str, token: str) -> None:
    await db.execute(
        "UPDATE providers SET gcal_access_token = $1, updated_at = NOW() WHERE provider_id = $2::uuid",
        token, provider_id
    )
