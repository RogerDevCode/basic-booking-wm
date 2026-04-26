from __future__ import annotations
from typing import List, Optional, Dict, Any, cast
from ..internal._result import Result, DBClient, ok, fail
from ._manage_models import InputSchema

async def handle_provider_actions(db: DBClient, input_data: InputSchema) -> Result[Dict[str, object]]:
    action = input_data.action
    if action == 'create_provider':
        if not input_data.name or not input_data.email:
            return fail("MISSING_FIELDS: name and email are required")
        rows = await db.fetch(
            """
            INSERT INTO providers (name, email, phone, specialty, timezone)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING provider_id, name
            """,
            input_data.name, input_data.email, input_data.phone, 
            input_data.specialty or 'Medicina General', input_data.timezone
        )
        if not rows: return fail("DATABASE_ERROR: Failed to create provider")
        res_create: Dict[str, object] = {"created": True, "provider_id": str(rows[0]["provider_id"]), "name": str(rows[0]["name"])}
        return ok(res_create)

    elif action == 'update_provider':
        if not input_data.provider_id: return fail("MISSING_FIELDS: provider_id is required")
        await db.execute(
            """
            UPDATE providers
            SET name = COALESCE($1, name),
                phone = COALESCE($2, phone),
                specialty = COALESCE($3, specialty),
                timezone = COALESCE($4, timezone),
                is_active = COALESCE($5, is_active),
                updated_at = NOW()
            WHERE provider_id = $6::uuid
            """,
            input_data.name, input_data.phone, input_data.specialty, 
            input_data.timezone, input_data.is_active, input_data.provider_id
        )
        res_upd: Dict[str, object] = {"updated": True}
        return ok(res_upd)

    elif action == 'list_providers':
        rows = await db.fetch("SELECT provider_id, name, email, phone, specialty, timezone, is_active FROM providers ORDER BY name ASC")
        res_list: Dict[str, object] = {"providers": [dict(r) for r in rows]}
        return ok(res_list)
    
    return fail(f"ROUTING_ERROR: Action {action} not handled by Provider handler")

async def handle_service_actions(db: DBClient, input_data: InputSchema) -> Result[Dict[str, object]]:
    action = input_data.action
    if action == 'create_service':
        if not input_data.provider_id or not input_data.service_name:
            return fail("MISSING_FIELDS: provider_id and service_name are required")
        rows = await db.fetch(
            """
            INSERT INTO services (provider_id, name, description, duration_minutes, buffer_minutes, price_cents, currency)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
            RETURNING service_id, name
            """,
            input_data.provider_id, input_data.service_name, input_data.description,
            input_data.duration_minutes or 30, input_data.buffer_minutes or 10,
            input_data.price_cents or 0, input_data.currency or 'MXN'
        )
        if not rows: return fail("DATABASE_ERROR: Failed to create service")
        res_create: Dict[str, object] = {"created": True, "service_id": str(rows[0]["service_id"]), "name": str(rows[0]["name"])}
        return ok(res_create)

    elif action == 'update_service':
        if not input_data.service_id: return fail("MISSING_FIELDS: service_id is required")
        await db.execute(
            """
            UPDATE services
            SET name = COALESCE($1, name),
                description = COALESCE($2, description),
                duration_minutes = COALESCE($3, duration_minutes),
                buffer_minutes = COALESCE($4, buffer_minutes),
                price_cents = COALESCE($5, price_cents),
                currency = COALESCE($6, currency),
                is_active = COALESCE($7, is_active)
            WHERE service_id = $8::uuid
            """,
            input_data.service_name, input_data.description, input_data.duration_minutes,
            input_data.buffer_minutes, input_data.price_cents, input_data.currency,
            input_data.is_active, input_data.service_id
        )
        res_upd: Dict[str, object] = {"updated": True}
        return ok(res_upd)

    elif action == 'list_services':
        rows = await db.fetch(
            """
            SELECT s.service_id, s.name, s.description, s.duration_minutes, s.buffer_minutes,
                   s.price_cents, s.currency, s.is_active, p.name as provider_name
            FROM services s JOIN providers p ON p.provider_id = s.provider_id
            ORDER BY p.name, s.name ASC
            """
        )
        res_list: Dict[str, object] = {"services": [dict(r) for r in rows]}
        return ok(res_list)

    return fail(f"ROUTING_ERROR: Action {action} not handled by Service handler")

async def handle_schedule_actions(db: DBClient, input_data: InputSchema) -> Result[Dict[str, object]]:
    action = input_data.action
    if action == 'set_schedule':
        if input_data.provider_id is None or input_data.day_of_week is None or not input_data.start_time or not input_data.end_time:
            return fail("MISSING_FIELDS: provider_id, day_of_week, start_time, end_time are required")
        await db.execute(
            """
            INSERT INTO provider_schedules (provider_id, day_of_week, start_time, end_time, is_active)
            VALUES ($1::uuid, $2, $3::time, $4::time, true)
            ON CONFLICT (provider_id, day_of_week, start_time)
            DO UPDATE SET end_time = EXCLUDED.end_time, is_active = true
            """,
            input_data.provider_id, input_data.day_of_week, input_data.start_time, input_data.end_time
        )
        res_upd: Dict[str, object] = {"updated": True}
        return ok(res_upd)

    elif action == 'remove_schedule':
        if input_data.provider_id is None or input_data.day_of_week is None:
            return fail("MISSING_FIELDS: provider_id and day_of_week are required")
        await db.execute(
            "UPDATE provider_schedules SET is_active = false WHERE provider_id = $1::uuid AND day_of_week = $2",
            input_data.provider_id, input_data.day_of_week
        )
        res_de: Dict[str, object] = {"deactivated": True}
        return ok(res_de)

    return fail(f"ROUTING_ERROR: Action {action} not handled by Schedule handler")

async def handle_override_actions(db: DBClient, input_data: InputSchema) -> Result[Dict[str, object]]:
    action = input_data.action
    if action == 'set_override':
        if not input_data.provider_id or not input_data.override_date:
            return fail("MISSING_FIELDS: provider_id and override_date are required")
        await db.execute(
            """
            INSERT INTO schedule_overrides (provider_id, override_date, is_blocked, start_time, end_time, reason)
            VALUES ($1::uuid, $2::date, $3, $4::time, $5::time, $6)
            ON CONFLICT (provider_id, override_date)
            DO UPDATE SET is_blocked = EXCLUDED.is_blocked,
                          start_time = EXCLUDED.start_time,
                          end_time = EXCLUDED.end_time,
                          reason = EXCLUDED.reason
            """,
            input_data.provider_id, input_data.override_date, input_data.is_blocked or False,
            input_data.start_time, input_data.end_time, input_data.override_reason
        )
        res_upd: Dict[str, object] = {"updated": True}
        return ok(res_upd)

    elif action == 'remove_override':
        if not input_data.provider_id or not input_data.override_date:
            return fail("MISSING_FIELDS: provider_id and override_date are required")
        await db.execute(
            "DELETE FROM schedule_overrides WHERE provider_id = $1::uuid AND override_date = $2::date",
            input_data.provider_id, input_data.override_date
        )
        res_del: Dict[str, object] = {"deleted": True}
        return ok(res_del)

    return fail(f"ROUTING_ERROR: Action {action} not handled by Override handler")
