from __future__ import annotations
import httpx
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any, Callable, Awaitable, TypeVar, cast
from ..internal._result import Result, ok, fail, DBClient
from ..internal.gcal_utils import build_gcal_event, BookingEventData
from ._reconcile_models import BookingRow, SyncResult

T = TypeVar("T")

GCAL_BASE = 'https://www.googleapis.com/calendar/v3'

async def retry_with_backoff(
    fn: Callable[[], Awaitable[Result[T]]],
    max_retries: int
) -> Result[T]:
    last_error = "Unknown error"
    for attempt in range(max_retries):
        err, data = await fn()
        if not err:
            return ok(cast(T, data))
        
        last_error = str(err)
        if "(permanent)" in last_error:
            return fail(err)
        
        if attempt < max_retries - 1:
            backoff_s = (3.0 ** attempt)
            await asyncio.sleep(backoff_s)
            
    return fail(f"Failed after {max_retries} retries: {last_error}")

async def call_gcal_api(
    method: str,
    calendar_id: str,
    path: str,
    body: Optional[Dict[str, object]] = None
) -> Result[Dict[str, object]]:
    from ..internal._wmill_adapter import get_variable
    access_token = get_variable("GCAL_ACCESS_TOKEN")
    if not access_token:
        return fail("GCAL_ACCESS_TOKEN not configured")

    import urllib.parse
    url = f"{GCAL_BASE}/calendars/{urllib.parse.quote(calendar_id)}/{path}"
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            response = await client.request(method, url, headers=headers, json=body)
            
            if response.status_code >= 400:
                return fail(f"GCal API {response.status_code}: {response.text}")

            if method == "DELETE":
                res_del: Dict[str, object] = {}
                return ok(res_del)

            data = response.json()
            return ok(cast(Dict[str, object], data))
    except Exception as e:
        return fail(f"Network error: {e}")

async def sync_booking_to_gcal(
    booking: BookingRow,
    max_retries: int
) -> SyncResult:
    result: SyncResult = {
        "providerEventId": booking["gcal_provider_event_id"],
        "clientEventId": booking["gcal_client_event_id"],
        "errors": []
    }

    event_data: BookingEventData = {
        "booking_id": booking["booking_id"],
        "status": booking["status"],
        "start_time": booking["start_time"],
        "end_time": booking["end_time"],
        "provider_name": booking["provider_name"],
        "service_name": booking["service_name"],
    }
    
    event_body = cast(Dict[str, object], build_gcal_event(event_data))

    # Sync Provider
    if booking["provider_calendar_id"]:
        cal_id = booking["provider_calendar_id"]
        
        async def sync_op() -> Result[Dict[str, object]]:
            if result["providerEventId"]:
                return await call_gcal_api('PUT', cal_id, f"events/{result['providerEventId']}", event_body)
            return await call_gcal_api('POST', cal_id, 'events', event_body)

        err_p, data_p = await retry_with_backoff(sync_op, max_retries)
        if not err_p and data_p:
            result["providerEventId"] = str(data_p.get("id"))
        else:
            result["errors"].append(f"Provider: {err_p}")

    # Sync Client
    if booking["client_calendar_id"]:
        cal_id = booking["client_calendar_id"]
        
        async def sync_op_cli() -> Result[Dict[str, object]]:
            if result["clientEventId"]:
                return await call_gcal_api('PUT', cal_id, f"events/{result['clientEventId']}", event_body)
            return await call_gcal_api('POST', cal_id, 'events', event_body)

        err_c, data_c = await retry_with_backoff(sync_op_cli, max_retries)
        if not err_c and data_c:
            result["clientEventId"] = str(data_c.get("id"))
        else:
            result["errors"].append(f"Client: {err_c}")

    # Handle Deletion if Cancelled
    if booking["status"] == 'cancelled':
        if result["providerEventId"] and booking["provider_calendar_id"]:
            cal_id_del = booking["provider_calendar_id"]
            eid = result["providerEventId"]
            err_d, _ = await retry_with_backoff(lambda: cast(Awaitable[Result[object]], call_gcal_api('DELETE', cal_id_del, f"events/{eid}")), max_retries)
            if not err_d:
                result["providerEventId"] = None
            else:
                result["errors"].append(f"Provider delete: {err_d}")

        if result["clientEventId"] and booking["client_calendar_id"]:
            cal_id_del_cli = booking["client_calendar_id"]
            eid_cli = result["clientEventId"]
            err_d_cli, _ = await retry_with_backoff(lambda: cast(Awaitable[Result[object]], call_gcal_api('DELETE', cal_id_del_cli, f"events/{eid_cli}")), max_retries)
            if not err_d_cli:
                result["clientEventId"] = None
            else:
                result["errors"].append(f"Client delete: {err_d_cli}")

    return result
