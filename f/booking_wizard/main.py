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

import re

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Multi-step appointment booking flow (availability → confirmation → creation)
# DB Tables Used  : bookings, providers, clients, services, provider_schedules
# Concurrency Risk: YES — booking creation uses GIST constraint
# GCal Calls      : NO — handled by async sync
# Idempotency Key : YES — deterministic key used
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates parameters
# ============================================================================
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ..internal._wmill_adapter import log
from ._wizard_logic import WizardRepository, WizardUI
from ._wizard_models import InputSchema, StepView, WizardState

MODULE = "booking_wizard"


async def _main_async(args: dict[str, object]) -> Result[dict[str, object]]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"invalid_input: {e}")

    conn = await create_db_client()
    try:
        # Determine Tenant
        tenant_id: str | None = input_data.provider_id
        if not tenant_id and input_data.wizard_state:
            tenant_id = str(input_data.wizard_state.get("client_id", ""))

        if not tenant_id:
            return fail("authentication_error: tenant_id_required")

        # 2. Execute within Tenant Context
        async def operation() -> Result[dict[str, object]]:
            repo = WizardRepository(conn)

            # Initial state
            raw_state = input_data.wizard_state or {}
            state = WizardState(
                step=int(raw_state.get("step", 0)),  # type: ignore[call-overload]
                client_id=str(raw_state.get("client_id", "")),
                chat_id=str(raw_state.get("chat_id", "")),
                selected_date=str(raw_state.get("selected_date")) if raw_state.get("selected_date") else None,
                selected_time=str(raw_state.get("selected_time")) if raw_state.get("selected_time") else None,
            )

            # Resolve Service Duration
            duration = 30
            if input_data.service_id:
                err_dur, d = await repo.get_service_duration(input_data.service_id)
                if not err_dur and d:
                    duration = d

            view: StepView | None = None
            action = input_data.action

            if action == "start":
                view = WizardUI.build_date_selection(state, 0)

            elif action == "select_date":
                if input_data.user_input and "Semana" in input_data.user_input:
                    offset = 7 if "siguiente" in input_data.user_input else 0
                    view = WizardUI.build_date_selection(state, offset)
                else:
                    match = re.search(r"(\d{4}-\d{2}-\d{2})", input_data.user_input or "")
                    d_str = match.group(1) if match else state.selected_date
                    if d_str:
                        state.selected_date = d_str
                        err_slots, slots = await repo.get_available_slots(input_data.provider_id or "", d_str, duration)
                        if err_slots:
                            return fail(err_slots)
                        view = WizardUI.build_time_selection(state, slots or [])
                    else:
                        view = WizardUI.build_date_selection(state, 0)

            elif action == "select_time":
                state.selected_time = input_data.user_input
                err_names, names = await repo.get_names(input_data.provider_id or "", input_data.service_id or "")
                if err_names or not names:
                    return fail(err_names or "names_not_found")
                view = WizardUI.build_confirmation(state, names["provider"], names["service"])

            elif action == "confirm":
                if not input_data.provider_id or not input_data.service_id:
                    return fail("missing_data_for_confirm")

                err_create, _bid = await repo.create_booking(
                    state.client_id,
                    input_data.provider_id,
                    input_data.service_id,
                    state.selected_date or "",
                    state.selected_time or "",
                    input_data.timezone,
                    duration,
                )
                if err_create:
                    return fail(err_create)

                state.step = 99
                view = {
                    "message": "✅ *Cita confirmada!*\n\nTu cita ha sido agendada. Recibirás un recordatorio.",
                    "reply_keyboard": [["« Volver al menú"]],
                    "new_state": state,
                    "force_reply": False,
                    "reply_placeholder": "",
                }

            elif action == "cancel":
                state.step = 0
                view = {
                    "message": "❌ Proceso cancelado. ¿En qué más puedo ayudarte?",
                    "reply_keyboard": [["📅 Agendar cita", "📋 Mis citas"]],
                    "new_state": state,
                    "force_reply": False,
                    "reply_placeholder": "",
                }

            elif action == "back":
                prev_step = max(0, state.step - 1)
                state.step = prev_step
                view = WizardUI.build_date_selection(state, 0)

            if not view:
                return fail("no_view_generated")

            res: dict[str, object] = {
                "message": view["message"],
                "reply_keyboard": view["reply_keyboard"],
                "force_reply": view["force_reply"],
                "reply_placeholder": view["reply_placeholder"],
                "wizard_state": view["new_state"].model_dump(),
                "is_complete": view["new_state"].step == 99,
            }
            return None, res

        return await with_tenant_context(conn, tenant_id, operation)

    except Exception as e:
        log("Wizard Orchestrator Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


def main(args: InputSchema | dict[str, object]) -> dict[str, object]:
    import asyncio
    import traceback
    from typing import cast

    from pydantic import BaseModel

    try:
        if isinstance(args, InputSchema):
            validated = args
        else:
            validated = InputSchema.model_validate(args)
            
        err, result = asyncio.run(_main_async(validated.model_dump()))
        if err:
            raise err
            
        if result is None:
            return {}
        
        if isinstance(result, BaseModel):
            return cast("dict[str, object]", result.model_dump())
        elif isinstance(result, dict):
            return result
        else:
            return {"data": result}
            
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
