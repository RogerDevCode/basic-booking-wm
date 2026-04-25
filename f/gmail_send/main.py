import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Send email notifications with HTML action links
# DB Tables Used  : NONE
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : NO
# Pydantic Schemas: YES — InputSchema validates recipient and message type
# ============================================================================

import os
from typing import Any, Dict
from ..internal._wmill_adapter import log
from ..internal._result import Result, ok, fail
from ._gmail_models import InputSchema, GmailSendData
from ._gmail_logic import build_email_content, send_with_retry

MODULE = "gmail_send"

async def _main_async(args: dict[str, Any]) -> Result[GmailSendData]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Invalid input: {e}")

    # 2. Resolve SMTP Configuration
    smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    try:
        smtp_port = int(os.getenv('SMTP_PORT', '587'))
    except ValueError:
        smtp_port = 587
        
    smtp_user = os.getenv('GMAIL_USER') or os.getenv('DEV_LOCAL_GMAIL_USER')
    smtp_pass = os.getenv('GMAIL_PASSWORD') or os.getenv('DEV_LOCAL_GMAIL_PASS')
    from_email = os.getenv('GMAIL_FROM_EMAIL') or smtp_user
    from_name = os.getenv('GMAIL_FROM_NAME', 'Sistema de Citas Médicas')

    if not smtp_user or not smtp_pass:
        return fail("SMTP credentials not configured (GMAIL_USER/GMAIL_PASSWORD)")

    smtp_config = {
        "host": smtp_host,
        "port": smtp_port,
        "user": smtp_user,
        "password": smtp_pass
    }

    # 3. Build Content
    subject, html = build_email_content(
        input_data.message_type,
        input_data.booking_details,
        input_data.action_links
    )

    # 4. Dispatch with Retry
    from_addr = f"{from_name} <{from_email}>"
    err_send, msg_id = await send_with_retry(
        smtp_config,
        from_addr,
        input_data.recipient_email,
        subject,
        html
    )

    if err_send:
        log("Gmail send failed", error=str(err_send), module=MODULE)
        return fail(err_send)

    return ok({
        "sent": True,
        "message_id": msg_id,
        "recipient_email": input_data.recipient_email,
        "message_type": input_data.message_type,
        "subject": subject
    })


def main(args: dict):
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=os.path.basename(os.path.dirname(__file__)))
        except:
            from ..internal._wmill_adapter import log
            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
