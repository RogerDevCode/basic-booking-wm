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
#   "typing-extensions>=4.12.0",
#   "wmill>=1.0.0"
# ]
# ///
from __future__ import annotations

import os
import sys
from typing import Any, Final

# Ensure parent directory is in path for relative imports to work in Windmill
current_dir = os.path.dirname(__file__)
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

try:
    from f.internal._db_client import create_db_client
    from f.internal._nlu_cache import ensure_nlu_cache, get_nlu_rule
    from f.internal._wmill_adapter import log
except ImportError:
    from .._db_client import create_db_client
    from .._nlu_cache import ensure_nlu_cache, get_nlu_rule
    from .._wmill_adapter import log

from wmill import task_script, workflow

MODULE: Final[str] = "booking_confirm"
book_create = task_script("f/booking_create/main", timeout=30)


def _user_message(err: Exception | str) -> str:
    """Map a technical error to a safe, user-friendly Spanish message."""
    msg = str(err).lower()
    if "duplicate" in msg or "unique" in msg or "already" in msg:
        return str(
            get_nlu_rule(
                "msg_slot_taken", "Ese horario ya fue reservado por otra persona. Por favor elige un horario diferente."
            )
        )
    if "client_has_overlapping_booking" in msg:
        return str(
            get_nlu_rule(
                "msg_client_overlap",
                "Ya tienes otra cita a esa misma hora. Por favor elige un horario diferente.",
            )
        )
    if "client_already_has_active_booking" in msg:
        return str(
            get_nlu_rule(
                "msg_already_booked",
                "Ya tienes una cita agendada. Cancela la cita actual antes de reservar una nueva.",
            )
        )
    if "no_service_for_provider" in msg:
        return str(
            get_nlu_rule(
                "msg_no_service",
                "El profesional seleccionado no tiene servicios"
                " disponibles en este momento. Intenta con otro profesional.",
            )
        )
    return str(
        get_nlu_rule(
            "msg_generic", "No pudimos confirmar tu cita en este momento. Por favor intenta de nuevo en unos minutos."
        )
    )


async def _resolve_service_id(provider_id: str) -> str | None:
    """Look up the active service_id for a given provider."""
    conn = await create_db_client()
    try:
        row = await conn.fetchrow(
            "SELECT service_id FROM services WHERE provider_id = $1::uuid AND is_active = true LIMIT 1",
            provider_id,
        )
        return str(row["service_id"]) if row else None
    except Exception as e:
        log("RESOLVE_SERVICE_ERROR", error=str(e), provider_id=provider_id, module=MODULE)
        return None
    finally:
        await conn.close()


@workflow  # type: ignore
async def main(
    client_id: str | None = None,
    provider_id: str | None = None,
    start_time: str | None = None,
    chat_id: str | None = None,
    pg_url: str | None = None,
) -> dict[str, Any]:
    if pg_url:
        os.environ["DATABASE_URL"] = pg_url

    log("BOOKING_CONFIRM_START", chat_id=chat_id, provider_id=provider_id, start_time=start_time, module=MODULE)

    if not client_id or not provider_id or not start_time or not chat_id:
        log(
            "BOOKING_CONFIRM_MISSING_PARAMS",
            client_id=client_id,
            provider_id=provider_id,
            start_time=start_time,
            chat_id=chat_id,
            module=MODULE,
        )
        return {
            "success": False,
            "error": "missing_parameters",
            "user_message": _user_message("generic"),
        }

    await ensure_nlu_cache()

    # 1. Resolve service_id from provider — booking_create requires it
    service_id = await _resolve_service_id(provider_id)
    if not service_id:
        log("BOOKING_CONFIRM_NO_SERVICE", provider_id=provider_id, module=MODULE)
        return {
            "success": False,
            "error": "no_service_for_provider",
            "user_message": _user_message("no_service_for_provider"),
        }

    # 2. Idempotency key scoped to Telegram chat + slot
    idempotency_key = f"tg:{chat_id}:{start_time}"

    try:
        log("CALLING_BOOK_CREATE", idempotency_key=idempotency_key, module=MODULE)
        result = await book_create(
            args={
                "client_id": client_id,
                "provider_id": provider_id,
                "service_id": service_id,
                "start_time": start_time,
                "idempotency_key": idempotency_key,
                "channel": "telegram",
                "actor": "client",
            }
        )
        err = None
        # Handle Windmill response wrapper if it wrapped it in 'data'
        if isinstance(result, dict):
            if "error" in result:
                err = str(result["error"])
                result = None
            elif "data" in result:
                result = result["data"]
    except Exception as e:
        import traceback

        tb = traceback.format_exc()
        log("BOOKING_CREATE_EXCEPTION", error=str(e), traceback=tb, module=MODULE)
        err = str(e)
        result = None

    if err:
        log("BOOKING_CONFIRM_FAILED", error=str(err), chat_id=chat_id, module=MODULE)
        return {"success": False, "error": str(err), "user_message": _user_message(err)}

    if not result or not isinstance(result, dict) or "booking_id" not in result:
        log("BOOKING_CONFIRM_NO_RESULT", chat_id=chat_id, module=MODULE)
        return {"success": False, "error": "no_result_from_booking_create", "user_message": _user_message("generic")}

    booking_id = str(result["booking_id"])
    log("BOOKING_CONFIRM_OK", booking_id=booking_id, chat_id=chat_id, module=MODULE)
    return {
        "success": True,
        "booking_id": booking_id,
        "booking_short_id": (lambda r: f"{r[:2]}-{r[2:5]}-{r[5:8]}")(booking_id[:8].upper()),
        "provider_name": str(result.get("provider_name", "Profesional")),
        "service_name": str(result.get("service_name", "Servicio")),
        "start_time": str(result.get("start_time", start_time)),
    }
