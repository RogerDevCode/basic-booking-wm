from __future__ import annotations
import asyncio
import os
import traceback
from typing import Any, Optional, Dict
from ..internal._wmill_adapter import log
from ._menu_models import MenuInput, MenuResponse
from ._menu_logic import MenuController

MODULE = "telegram_menu"

async def _main_async(args: dict[str, object]) -> Dict[str, object]:
    try:
        input_data = MenuInput(
            action=str(args.get("action", "show")),
            chat_id=str(args.get("chat_id", "")),
            user_input=str(args.get("user_input")) if args.get("user_input") else None
        )
        
        controller = MenuController()
        response = await controller.handle(input_data)
        
        return {
            "success": True,
            "handled": response.handled,
            "response_text": response.response_text,
            "inline_buttons": response.inline_buttons
        }
    except Exception as e:
        log("Menu process failed", error=str(e), module=MODULE)
        return {
            "success": False,
            "handled": False,
            "response_text": "Error procesando el menú.",
            "inline_buttons": [],
            "error_message": str(e)
        }

def main(action: str, chat_id: str, user_input: Optional[str] = None) -> Dict[str, object]:
    args: dict[str, object] = {"action": action, "chat_id": chat_id, "user_input": user_input}
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_MENU_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            print(f"CRITICAL ERROR: {e}\n{tb}")
        raise RuntimeError(f"Menu failed: {e}")
