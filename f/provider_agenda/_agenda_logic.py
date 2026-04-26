from __future__ import annotations
from datetime import datetime, date
from typing import List, Dict, Any, cast
from ..internal._result import Result, DBClient, ok, fail
from ._agenda_models import AgendaRow, AgendaInput

async def get_provider_agenda(db: DBClient, input_data: AgendaInput) -> Result[List[AgendaRow]]:
    try:
        # 1. Base Query
        sql = """
            SELECT b.booking_id, b.status, b.start_time, b.end_time,
                   c.name as client_name, c.phone as client_phone,
                   s.name as service_name
            FROM bookings b
            JOIN clients c ON c.client_id = b.client_id
            JOIN services s ON s.service_id = b.service_id
            WHERE b.provider_id = $1::uuid
              AND b.start_time::date = $2::date
              AND b.status NOT IN ('cancelled', 'rescheduled')
            ORDER BY b.start_time ASC
        """
        
        rows = await db.fetch(sql, input_data.provider_id, input_data.target_date)
        
        res: List[AgendaRow] = []
        for r in rows:
            # Map row to AgendaRow with strict types
            # Mypy needs explicit casts for datetime objects from database
            st = cast(datetime, r["start_time"])
            et = cast(datetime, r["end_time"])
            
            res.append({
                "booking_id": str(r["booking_id"]),
                "status": str(r["status"]),
                "start_time": st.isoformat(),
                "end_time": et.isoformat(),
                "client_name": str(r["client_name"]),
                "client_phone": str(r["client_phone"]) if r.get("client_phone") else None,
                "service_name": str(r["service_name"])
            })
            
        return ok(res)
    except Exception as e:
        return fail(f"agenda_fetch_error: {e}")
