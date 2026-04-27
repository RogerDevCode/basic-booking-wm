from __future__ import annotations

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Configure reminder preferences (UI-driven)
# DB Tables Used  : clients
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps DB ops
# Pydantic Schemas: YES — InputSchema validates action and client_id
# ============================================================================
from typing import Any, cast

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_tenant_context
from ..internal._wmill_adapter import log
from ._config_logic import build_config_message, build_window_config, load_preferences, save_preferences, set_all
from ._config_models import InputSchema, ReminderConfigResult, ReminderPrefs

MODULE = "reminder_config"


async def _main_async(args: dict[str, object]) -> Result[ReminderConfigResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Invalid input: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[ReminderConfigResult]:
            prefs = await load_preferences(conn, input_data.client_id)

            message = ""
            reply_keyboard: list[list[str]] | None = None

            # Mutators
            if input_data.action == "toggle_channel":
                if input_data.channel == "telegram":
                    all_on = prefs["telegram_24h"] and prefs["telegram_2h"] and prefs["telegram_30min"]
                    prefs = cast(
                        "ReminderPrefs",
                        {**prefs, "telegram_24h": not all_on, "telegram_2h": not all_on, "telegram_30min": not all_on},
                    )
                elif input_data.channel == "gmail":
                    prefs = cast("ReminderPrefs", {**prefs, "gmail_24h": not prefs["gmail_24h"]})
                await save_preferences(conn, input_data.client_id, prefs)

            elif input_data.action == "toggle_window":
                if input_data.window:
                    key = f"telegram_{input_data.window}"
                    if key in prefs:
                        # Using cast to Any temporarily to bypass literal-required issue
                        new_val = not cast("Any", prefs)[key]
                        cast("Any", prefs)[key] = new_val
                        await save_preferences(conn, input_data.client_id, prefs)

            elif input_data.action == "deactivate_all":
                prefs = set_all(prefs, False)
                await save_preferences(conn, input_data.client_id, prefs)

            elif input_data.action == "activate_all":
                prefs = set_all(prefs, True)
                await save_preferences(conn, input_data.client_id, prefs)

            # View Builders
            if input_data.action in ["show", "toggle_channel"]:
                message, reply_keyboard = build_config_message(prefs)
            elif input_data.action == "toggle_window":
                message, reply_keyboard = build_window_config(prefs)
            elif input_data.action == "deactivate_all":
                message = "🔕 *Recordatorios desactivados*\n\nNo recibirás avisos automáticos."
                reply_keyboard = [["✅ Activar todo", "« Volver al menú"]]
            elif input_data.action == "activate_all":
                message = "🔔 *Recordatorios activados*\n\nRecibirás avisos en todos los canales y ventanas."
                reply_keyboard = [["⚙️ Configurar", "« Volver al menú"]]
            elif input_data.action == "back":
                message = "📋 Menú principal. ¿En qué puedo ayudarte?"
                reply_keyboard = [["📅 Agendar cita", "📋 Mis citas"], ["🔔 Recordatorios", "❓ Información"]]

            res: ReminderConfigResult = {"message": message, "reply_keyboard": reply_keyboard, "preferences": prefs}
            return ok(res)

        return await with_tenant_context(conn, input_data.client_id, operation)

    except Exception as e:
        log("Reminder Config Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


async def main(args: dict[str, object]) -> Result[ReminderConfigResult]:
    """Windmill entrypoint."""
    return await _main_async(args)
