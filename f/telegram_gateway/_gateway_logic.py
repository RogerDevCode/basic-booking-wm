from __future__ import annotations

from typing import TYPE_CHECKING, cast

import httpx

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok

if TYPE_CHECKING:
    from ._gateway_models import SendMessageOptions


class TelegramClient:
    def __init__(self, token: str) -> None:
        self.token = token
        self.base_url = f"https://api.telegram.org/bot{token}"

    async def send_message(
        self, chat_id: str, text: str, options: SendMessageOptions | None = None
    ) -> Result[dict[str, object]]:
        if not self.token:
            return fail("TELEGRAM_BOT_TOKEN_MISSING")

        url = f"{self.base_url}/sendMessage"
        body = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": options.parse_mode if options else "Markdown",
            "reply_markup": options.reply_markup if options else None,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload: dict[str, object] = {k: v for k, v in body.items() if v is not None}
                res = await client.post(url, json=payload)
                if res.status_code >= 400:
                    return fail(f"telegram_api_error: {res.status_code} {res.text[:100]}")

                data_raw: object = res.json()
                if not isinstance(data_raw, dict):
                    return fail("telegram_api_error: invalid_response_format")

                return ok(cast("dict[str, object]", data_raw))
        except Exception as e:
            return fail(f"send_message_failed: {e}")


class ClientRepository:
    def __init__(self, db_url: str) -> None:
        self.db_url = db_url

    async def ensure_registered(self, full_name: str) -> Result[None]:
        if not self.db_url:
            return fail("DATABASE_URL_MISSING")

        conn = await create_db_client()
        try:
            # Global context (no RLS for discovery/registration per §6)
            await conn.execute(
                """
                INSERT INTO clients (client_id, name, email, phone, timezone)
                VALUES (gen_random_uuid(), $1, NULL, NULL, 'America/Mexico_City')
                ON CONFLICT (email) DO NOTHING
                """,
                full_name,
            )
            return ok(None)
        except Exception as e:
            return fail(f"client_registration_failed: {e}")
        finally:
            await conn.close()
