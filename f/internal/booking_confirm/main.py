# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0"
# ]
# ///
from __future__ import annotations

from typing import Final

from .._db_client import create_db_client
from .._nlu_cache import ensure_nlu_cache, get_nlu_rule
from .._wmill_adapter import log

MODULE: Final[str] = "booking_confirm"

def _user_message(err: Exception | str) -> str:
    """Map a technical error to a safe, user-friendly Spanish message."""
    msg = str(err).lower()
    if "duplicate" in msg or "unique" in msg or "already" in msg:
        return str(get_nlu_rule("msg_slot_taken", "Ese horario ya fue reservado por otra persona. Por favor elige un horario diferente."))
    if "no_service_for_provider" in msg:
        return str(get_nlu_rule("msg_no_service", "El profesional seleccionado no tiene servicios disponibles en este momento. Intenta con otro profesional."))
    return str(get_nlu_rule("msg_generic", "No pudimos confirmar tu cita en este momento. Por favor intenta de nuevo en unos minutos."))


async def _resolve_service_id(provider_id: str) -> str | None:
    """Look up the active service_id for a given provider."""
    conn = await create_db_client()
    try:
        row = await conn.fetchrow(
            "SELECT service_id FROM services WHERE provider_id = $1::uuid AND is_active = true LIMIT 1",
            provider_id,
        )
        return str(row["service_id"]) if row else None
    finally:
        await conn.close()


async def _main_async(
    client_id: str,
    provider_id: str,
    start_time: str,
    chat_id: str,
    pg_url: str | None = None,
) -> dict[str, object]:
    import os

    if pg_url:
        os.environ["DATABASE_URL"] = pg_url

    await ensure_nlu_cache()

    from f.booking_create.main import main_async as booking_create_async

    # 1. Resolve service_id from provider — booking_create requires it
    service_id = await _resolve_service_id(provider_id)
    if not service_id:
        log("BOOKING_CONFIRM_NO_SERVICE", provider_id=provider_id, module=MODULE)
        return {"success": False, "error": "no_service_for_provider", "user_message": _user_message("no_service_for_provider")}

    # 2. Idempotency key scoped to Telegram chat + slot
    idempotency_key = f"tg:{chat_id}:{start_time}"

    # 3. Delegate to booking_create (handles concurrency, audit, RLS)
    err, result = await booking_create_async(
        {
            "client_id": client_id,
            "provider_id": provider_id,
            "service_id": service_id,
            "start_time": start_time,
            "idempotency_key": idempotency_key,
            "channel": "telegram",
            "actor": "client",
        }
    )

    if err:
        log("BOOKING_CONFIRM_FAILED", error=str(err), chat_id=chat_id, module=MODULE)
        return {"success": False, "error": str(err), "user_message": _user_message(err)}

    if not result:
        return {"success": False, "error": "no_result_from_booking_create", "user_message": _user_message("generic")}

    booking_id = str(result["booking_id"])
    log("BOOKING_CONFIRM_OK", booking_id=booking_id, chat_id=chat_id, module=MODULE)
    return {
        "success": True,
        "booking_id": booking_id,
        "booking_short_id": booking_id[:8].upper(),
        "provider_name": str(result["provider_name"]),
        "service_name": str(result["service_name"]),
        "start_time": str(result["start_time"]),
    }


def main(
    client_id: str,
    provider_id: str,
    start_time: str,
    chat_id: str,
    pg_url: str | None = None,
) -> dict[str, object]:
    import asyncio

    return asyncio.run(_main_async(client_id, provider_id, start_time, chat_id, pg_url))
