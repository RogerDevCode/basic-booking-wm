# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Display main menu with persistent reply keyboard
# DB Tables Used  : NONE
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : NO
# Pydantic Schemas: YES — InputSchema validates chat_id and action
# ============================================================================

from typing import Any, Dict
from ..internal._wmill_adapter import log
from ._menu_models import InputSchema, MenuResult
from ._menu_logic import handle_show_menu, handle_select_option

MODULE = "telegram_menu"

def main(args: dict[str, Any]) -> MenuResult:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return {
            "success": False,
            "data": None,
            "error_message": f"Validation error: {e}"
        }

    # 2. Routing
    try:
        if input_data.action in ['show', 'start']:
            return handle_show_menu(input_data)

        if input_data.action == 'select_option':
            return handle_select_option(input_data)

        return {
            "success": False,
            "data": None,
            "error_message": f"Unknown action: {input_data.action}"
        }

    except Exception as e:
        log("Telegram Menu Error", error=str(e), module=MODULE)
        return {
            "success": False,
            "data": None,
            "error_message": f"Internal error: {e}"
        }
