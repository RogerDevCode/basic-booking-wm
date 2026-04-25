import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Synchronize medical booking with Google Calendar
# DB Tables Used  : bookings, providers, clients, services, booking_audit
# Concurrency Risk: LOW — row-level updates on booking sync status
# GCal Calls      : YES — POST/PUT/DELETE events
# Idempotency Key : YES — uses gcal_provider_event_id to prevent duplicates
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates all inputs
# ============================================================================

from typing import Any, List, Optional
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail
from ._gcal_sync_models import InputSchema, GCalSyncResult, BookingDetails
from ._gcal_api_adapter import fetch_booking_details
from ._sync_event_logic import sync_event
from ._update_sync_status import update_booking_sync_status

MODULE = "gcal_sync"

async def _main_async(args: dict[str, Any]) -> Result[GCalSyncResult]:
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return Exception(f"Validation error: {e}"), None

    conn = await create_db_client()
    try:
        # 1. Fetch Details
        err_details, details = await fetch_booking_details(conn, input_data.tenant_id, input_data.booking_id)
        if err_details or not details:
            return err_details or Exception("Booking details not found"), None

        errors: List[str] = []
        provider_event_id: Optional[str] = details["gcal_provider_event_id"]
        client_event_id: Optional[str] = details["gcal_client_event_id"]

        # 2. Sync Provider Calendar
        err_prov, new_prov_id = await sync_event(conn, details, 'provider', input_data.action)
        if err_prov:
            errors.append(f"Provider sync failed: {err_prov}")
        else:
            provider_event_id = new_prov_id or provider_event_id

        # 3. Sync Client Calendar (if available)
        if details["client_calendar_id"]:
            err_cli, new_cli_id = await sync_event(conn, details, 'client', input_data.action)
            if err_cli:
                errors.append(f"Client sync failed: {err_cli}")
            else:
                client_event_id = new_cli_id or client_event_id

        # 4. Finalize Status
        sync_status: Any = 'synced'
        if errors:
            sync_status = 'partial' if provider_event_id or client_event_id else 'pending'
        
        # We don't have easy access to current retry_count here without adding it to fetch_booking_details
        # For now we assume this main is called once per sync attempt
        # Real retry logic is in gcal_reconcile
        
        await update_booking_sync_status(
            conn, input_data.tenant_id, input_data.booking_id,
            provider_event_id, client_event_id,
            sync_status, 0, # retry_count managed by reconcile
            "\n".join(errors) if errors else None
        )

        result: GCalSyncResult = {
            "booking_id": input_data.booking_id,
            "provider_event_id": provider_event_id,
            "client_event_id": client_event_id,
            "sync_status": sync_status,
            "retry_count": 0,
            "errors": errors
        }

        return None, result

    except Exception as e:
        log("Unexpected error in gcal_sync", error=str(e), module=MODULE)
        return Exception(f"Internal error: {e}"), None
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]


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
