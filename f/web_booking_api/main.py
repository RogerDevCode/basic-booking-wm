# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Web Booking API orchestrator (crear/cancelar/reagendar)
# DB Tables Used  : providers, services, bookings, clients, users
# Concurrency Risk: YES — uses FOR UPDATE on provider
# GCal Calls      : NO — handled by async sync
# Idempotency Key : YES — deterministic derivation
# RLS Tenant ID   : YES — with_tenant_context wraps all ops
# Pydantic Schemas: YES — InputSchema validates parameters
# ============================================================================

from typing import Any, Dict, cast
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, fail, with_tenant_context
from ._booking_models import InputSchema, BookingResult
from ._booking_logic import BookingRepository, calculate_end_time, derive_idempotency_key

MODULE = "web_booking_api"

async def main(args: dict[str, Any]) -> Result[BookingResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"error_validacion: {e}")

    conn = await create_db_client()
    try:
        repo = BookingRepository(conn)
        
        # 2. Resolve Tenant Context
        tenant_id: str
        if input_data.action == 'crear':
            if not input_data.provider_id: return fail("provider_id_requerido")
            tenant_id = input_data.provider_id
        else:
            if not input_data.booking_id: return fail("booking_id_requerido")
            err_t, resolved_t = await repo.resolve_tenant_for_booking(input_data.booking_id)
            if err_t or not resolved_t: return fail(err_t or "resolucion_tenant_fallida")
            tenant_id = resolved_t

        # 3. Execute within Tenant Context
        async def operation() -> Result[BookingResult]:
            # 3.1 Resolve Client ID
            err_c, client_id = await repo.resolve_client_id(input_data.user_id)
            if err_c or not client_id: return fail(err_c or "resolucion_cliente_fallida")

            if input_data.action == 'crear':
                if not input_data.service_id or not input_data.start_time:
                    return fail("datos_insuficientes_crear")
                
                await repo.lock_provider(tenant_id)
                err_dur, duration = await repo.get_service_duration(input_data.service_id)
                if err_dur: return fail(err_dur)
                
                err_time, end_time = calculate_end_time(input_data.start_time, cast(int, duration))
                if err_time or not end_time: return fail(err_time)
                
                err_overlap, _ = await repo.check_overlap(tenant_id, input_data.start_time, end_time)
                if err_overlap: return fail(err_overlap)
                
                ik = input_data.idempotency_key or derive_idempotency_key('crear', [tenant_id, client_id, input_data.service_id, input_data.start_time])
                
                err_ins, b = await repo.insert_booking({
                    "tenant_id": tenant_id, "client_id": client_id, "service_id": input_data.service_id,
                    "start_time": input_data.start_time, "end_time": end_time, "idempotency_key": ik
                })
                if err_ins or not b: return fail(err_ins)
                
                return ok({**cast(dict, b), "message": "Cita creada exitosamente"})

            elif input_data.action == 'cancelar':
                if not input_data.booking_id: return fail("booking_id_requerido")
                err_b, booking = await repo.get_booking(input_data.booking_id)
                if err_b or not booking: return fail(err_b)
                if booking["client_id"] != client_id: return fail("permiso_denegado_cita")
                if booking["status"] not in ['pending', 'confirmed']: # English statuses
                    return fail(f"estado_invalido_cancelar: {booking['status']}")
                
                await repo.update_status(input_data.booking_id, 'cancelled', input_data.cancellation_reason)
                return ok({"booking_id": input_data.booking_id, "status": 'cancelled', "message": "Cita cancelada exitosamente"})

            elif input_data.action == 'reagendar':
                if not input_data.booking_id or not input_data.start_time:
                    return fail("datos_insuficientes_reagendar")
                
                err_b, old = await repo.get_booking(input_data.booking_id)
                if err_b or not old: return fail(err_b)
                if old["client_id"] != client_id: return fail("permiso_denegado_cita")
                if old["status"] not in ['pending', 'confirmed']:
                    return fail("estado_invalido_reagendar")
                
                await repo.lock_provider(tenant_id)
                err_dur, duration = await repo.get_service_duration(old["service_id"])
                if err_dur: return fail(err_dur)
                
                err_time, end_time = calculate_end_time(input_data.start_time, cast(int, duration))
                if err_time or not end_time: return fail(err_time)
                
                err_overlap, _ = await repo.check_overlap(tenant_id, input_data.start_time, end_time, input_data.booking_id)
                if err_overlap: return fail(err_overlap)
                
                ik = input_data.idempotency_key or derive_idempotency_key('reagendar', [input_data.booking_id, input_data.start_time])
                
                err_ins, b = await repo.insert_booking({
                    "tenant_id": tenant_id, "client_id": client_id, "service_id": old["service_id"],
                    "start_time": input_data.start_time, "end_time": end_time, "idempotency_key": ik,
                    "rescheduled_from": input_data.booking_id
                })
                if err_ins or not b: return fail(err_ins)
                
                await repo.update_status(input_data.booking_id, 'rescheduled')
                return ok({**cast(dict, b), "message": "Cita reagendada exitosamente"})

            return fail("unsupported_action")

        return await with_tenant_context(conn, tenant_id, operation)

    except Exception as e:
        log("Web Booking API Internal Error", error=str(e), module=MODULE)
        return fail(f"error_inesperado: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]
