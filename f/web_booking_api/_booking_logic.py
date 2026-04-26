from typing import Any
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, cast
from ..internal._result import Result, DBClient, ok, fail, with_tenant_context
from ._booking_models import InputSchema, BookingResult

def derive_idempotency_key(prefix: str, parts: List[str]) -> str:
    combined = f"{prefix}:{':'.join(parts)}".encode('utf-8')
    return hashlib.sha256(combined).hexdigest()[:32]

def calculate_end_time(start_time_str: str, duration_minutes: int) -> Result[str]:
    try:
        start = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        end = start + timedelta(minutes=duration_minutes)
        return ok(end.isoformat().replace("+00:00", "Z"))
    except Exception as e:
        from ..internal._wmill_adapter import log
        log("SILENT_ERROR_CAUGHT", error=str(e), file="_booking_logic.py")
        return fail("formato_fecha_invalido")

class BookingRepository:
    def __init__(self, db: DBClient) -> None:
        self.db = db

    async def resolve_tenant_for_booking(self, booking_id: str) -> Result[str]:
        rows = await self.db.fetch("SELECT provider_id FROM bookings WHERE booking_id = $1::uuid LIMIT 1", booking_id)
        if not rows: return fail("cita_no_encontrada")
        return ok(str(rows[0]["provider_id"]))

    async def resolve_client_id(self, user_id: str) -> Result[str]:
        # Direct lookup
        rows = await self.db.fetch("SELECT client_id FROM clients WHERE client_id = $1::uuid LIMIT 1", user_id)
        if rows: return ok(str(rows[0]["client_id"]))
        
        # Email lookup via users
        rows = await self.db.fetch("SELECT email FROM users WHERE user_id = $1::uuid LIMIT 1", user_id)
        if not rows or not rows[0].get("email"): return fail("cliente_no_registrado")
        
        email = rows[0]["email"]
        rows = await self.db.fetch("SELECT client_id FROM clients WHERE email = $1 LIMIT 1", email)
        if not rows: return fail("cliente_no_registrado")
        return ok(str(rows[0]["client_id"]))

    async def lock_provider(self, provider_id: str) -> Result[bool]:
        rows = await self.db.fetch("SELECT provider_id FROM providers WHERE provider_id = $1::uuid AND is_active = true FOR UPDATE", provider_id)
        if not rows: return fail("proveedor_inactivo")
        return ok(True)

    async def get_service_duration(self, service_id: str) -> Result[int]:
        rows = await self.db.fetch("SELECT duration_minutes FROM services WHERE service_id = $1::uuid LIMIT 1", service_id)
        if not rows: return fail("servicio_no_encontrado")
        return ok(int(rows[0]["duration_minutes"]))

    async def check_overlap(self, provider_id: str, start: str, end: str, ignore_id: Optional[str] = None) -> Result[bool]:
        # Using English statuses from standardized migration
        query = """
            SELECT booking_id FROM bookings
            WHERE provider_id = $1::uuid
              AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
              AND start_time < $2::timestamptz
              AND end_time > $3::timestamptz
        """
        params = [provider_id, end, start]
        if ignore_id:
            query += " AND booking_id != $4::uuid"
            params.append(ignore_id)
        
        rows = await self.db.fetch(query + " LIMIT 1", *params)
        if rows: return fail("horario_ocupado")
        return ok(False)

    async def insert_booking(self, data: Dict[str, Any]) -> Result[Dict[str, Any]]:
        rows = await self.db.fetch(
            """
            INSERT INTO bookings (
              provider_id, client_id, service_id, start_time, end_time,
              status, idempotency_key, rescheduled_from, gcal_sync_status
            ) VALUES (
              $1::uuid, $2::uuid, $3::uuid,
              $4::timestamptz, $5::timestamptz,
              'pending', $6, $7::uuid, 'pending'
            )
            ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
            RETURNING booking_id, status
            """,
            data["tenant_id"], data["client_id"], data["service_id"],
            data["start_time"], data["end_time"], data["idempotency_key"],
            data.get("rescheduled_from")
        )
        if not rows: return fail("error_insercion_booking")
        return ok({"booking_id": str(rows[0]["booking_id"]), "status": str(rows[0]["status"])})

    async def get_booking(self, booking_id: str) -> Result[Dict[str, Any]]:
        rows = await self.db.fetch("SELECT status, client_id, service_id FROM bookings WHERE booking_id = $1::uuid LIMIT 1", booking_id)
        if not rows: return fail("cita_no_encontrada")
        return ok({"status": str(rows[0]["status"]), "client_id": str(rows[0]["client_id"]), "service_id": str(rows[0]["service_id"])})

    async def update_status(self, booking_id: str, status: str, reason: Optional[str] = None) -> Result[bool]:
        rows = await self.db.fetch(
            "UPDATE bookings SET status = $1, cancellation_reason = $2, updated_at = NOW() WHERE booking_id = $3::uuid RETURNING booking_id",
            status, reason, booking_id
        )
        if not rows: return fail("error_actualizacion_booking")
        return ok(True)
