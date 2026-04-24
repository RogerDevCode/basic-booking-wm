# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Send 24h/2h/30min appointment reminders
# DB Tables Used  : bookings, clients, providers, services
# Concurrency Risk: YES — batch updates
# GCal Calls      : NO
# Idempotency Key : YES — reminder flags in DB
# RLS Tenant ID   : YES — with_tenant_context wraps each provider's batch
# Pydantic Schemas: YES — InputSchema validates parameters
# ============================================================================

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, cast
from ..internal._wmill_adapter import log, run_script
from ..internal._db_client import create_db_client
from ..internal._result import Result, with_tenant_context, ok, fail
from ._reminder_models import InputSchema, CronResult, BookingRecord, ReminderWindow
from ._reminder_logic import build_booking_details, build_inline_buttons, get_client_preference
from ._reminder_repository import get_bookings_for_window, mark_reminder_sent

MODULE = "reminder_cron"

async def main(args: dict[str, Any]) -> Result[CronResult]:
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Invalid input: {e}")

    conn = await create_db_client()
    try:
        now = datetime.now(timezone.utc)
        
        # Calculate Windows
        windows: List[tuple[ReminderWindow, datetime, datetime]] = [
            ('24h', now + timedelta(hours=23), now + timedelta(hours=25)),
            ('2h', now + timedelta(minutes=110), now + timedelta(minutes=130)),
            ('30min', now + timedelta(minutes=25), now + timedelta(minutes=35)),
        ]

        result: CronResult = {
            "reminders_24h_sent": 0, "reminders_2h_sent": 0, "reminders_30min_sent": 0,
            "errors": 0, "dry_run": input_data.dry_run, "processed_bookings": []
        }

        # 1. Fetch all active providers
        providers = await conn.fetch("SELECT provider_id FROM providers WHERE is_active = True")
        
        for p in providers:
            p_id = str(p["provider_id"])
            
            async def provider_batch() -> Result[None]:
                for win_name, w_start, w_end in windows:
                    bookings = await get_bookings_for_window(conn, win_name, w_start, w_end)
                    
                    for b in bookings:
                        result["processed_bookings"].append(b["booking_id"])
                        details = build_booking_details(b, input_data.timezone)
                        buttons = build_inline_buttons(b["booking_id"], win_name)
                        
                        if input_data.dry_run:
                            result[f"reminders_{win_name}_sent"] += 1 # type: ignore[literal-required]
                            continue

                        msg_type = f"reminder_{win_name}"
                        
                        # Telegram
                        if b["client_telegram_chat_id"] and get_client_preference(b["reminder_preferences"], 'telegram', win_name):
                            err_tg, _ = run_script("f/telegram_send/main.py", {
                                "chat_id": b["client_telegram_chat_id"],
                                "text": f"🔔 Recordatorio de tu cita:\n\nDoctor: {details['provider_name']}\nFecha: {details['date']}\nHora: {details['time']}",
                                "mode": "send_message",
                                "inline_buttons": buttons
                            })
                            if err_tg: result["errors"] += 1

                        # Gmail
                        if b["client_email"] and get_client_preference(b["reminder_preferences"], 'email', win_name):
                            err_gm, _ = run_script("f/gmail_send/main.py", {
                                "recipient_email": b["client_email"],
                                "message_type": msg_type,
                                "booking_details": details
                                # links added by gmail_send
                            })
                            if err_gm: result["errors"] += 1

                        # Mark as sent
                        await mark_reminder_sent(conn, b["booking_id"], win_name)
                        result[f"reminders_{win_name}_sent"] += 1 # type: ignore[literal-required]

                return ok(None)

            await with_tenant_context(conn, p_id, provider_batch)

        return ok(result)

    except Exception as e:
        log("Unexpected error in reminder_cron", error=str(e), module=MODULE)
        return fail(f"Internal error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
