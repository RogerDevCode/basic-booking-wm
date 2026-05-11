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

import asyncio
import os
import traceback
from datetime import datetime
from typing import Any, Final

from ...booking_create._booking_create_models import InputSchema as BookingCreateInput
from ...booking_create._booking_create_repository import PostgresBookingCreateRepository
from ...booking_create._create_booking_logic import execute_create_booking
from .._db_client import create_db_client
from .._nlu_cache import ensure_nlu_cache, get_nlu_rule
from .._result import DBClient, with_tenant_context
from .._wmill_adapter import log

MODULE: Final[str] = "booking_confirm"


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


async def _resolve_service_id(db: DBClient, provider_id: str) -> str | None:
    """Look up the active service_id for a given provider."""
    row = await db.fetchrow(
        "SELECT service_id FROM services WHERE provider_id = $1::uuid AND is_active = true LIMIT 1",
        provider_id,
    )
    return str(row["service_id"]) if row else None


async def _main_async(
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

    conn = await create_db_client()
    try:
        # 1. Resolve service_id from provider
        service_id = await _resolve_service_id(conn, provider_id)
        if not service_id:
            log("BOOKING_CONFIRM_NO_SERVICE", provider_id=provider_id, module=MODULE)
            return {
                "success": False,
                "error": "no_service_for_provider",
                "user_message": _user_message("no_service_for_provider"),
            }

        # 2. Build core booking input
        idempotency_key = f"tg:{chat_id}:{start_time}"
        try:
            parsed_start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        except ValueError:
            log("BOOKING_CONFIRM_INVALID_START_TIME", start_time=start_time, module=MODULE)
            return {
                "success": False,
                "error": "invalid_start_time",
                "user_message": _user_message("generic"),
            }

        input_data = BookingCreateInput.model_validate(
            {
                "client_id": client_id,
                "provider_id": provider_id,
                "service_id": service_id,
                "start_time": parsed_start,
                "idempotency_key": idempotency_key,
                "channel": "telegram",
                "actor": "client",
            }
        )

        # 3. Execute creation core logic in-process
        log("CALLING_BOOK_CREATE", idempotency_key=idempotency_key, module=MODULE)
        repo = PostgresBookingCreateRepository(conn)

        async def operation() -> tuple[Exception | None, Any | None]:
            try:
                result = await execute_create_booking(repo, input_data)
                return None, result
            except Exception as e:
                return e, None

        err, result = await with_tenant_context(conn, provider_id, operation)

        if err is not None:
            log("BOOKING_CONFIRM_FAILED", error=str(err), chat_id=chat_id, module=MODULE)
            return {"success": False, "error": str(err), "user_message": _user_message(err)}

        if not result or "booking_id" not in result:
            log("BOOKING_CONFIRM_NO_RESULT", chat_id=chat_id, module=MODULE)
            return {
                "success": False,
                "error": "no_result_from_booking_create",
                "user_message": _user_message("generic"),
            }

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

    except Exception as err:
        log("BOOKING_CONFIRM_FAILED", error=str(err), chat_id=chat_id, module=MODULE)
        tb = traceback.format_exc()
        log("BOOKING_CREATE_EXCEPTION", error=str(err), traceback=tb, module=MODULE)
        return {"success": False, "error": str(err), "user_message": _user_message(err)}
    finally:
        await conn.close()


def main(
    client_id: str | None = None,
    provider_id: str | None = None,
    start_time: str | None = None,
    chat_id: str | None = None,
    pg_url: str | None = None,
) -> dict[str, Any]:
    try:
        return asyncio.run(
            _main_async(
                client_id=client_id,
                provider_id=provider_id,
                start_time=start_time,
                chat_id=chat_id,
                pg_url=pg_url,
            )
        )
    except Exception as e:
        tb = traceback.format_exc()
        try:
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        return {
            "success": False,
            "error": f"Execution failed: {e}",
            "user_message": "Lo siento, hubo un error interno. Por favor intenta de nuevo.",
        }
