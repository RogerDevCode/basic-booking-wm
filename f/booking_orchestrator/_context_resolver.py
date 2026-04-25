from typing import Optional
from f.internal._result import Result, DBClient
from f.internal._date_resolver import resolve_date, resolve_time
from ._get_entity import get_entity
from ._orchestrator_models import OrchestratorInput, ResolvedContext

"""
PRE-FLIGHT
Mission          : Resolve full context (ids, date, time) from partial AI input.
DB Tables Used   : providers, services, clients, specialties
Concurrency Risk : NO — read-only (except client creation)
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : NO — discovery mode
Zod Schemas      : NO
"""

async def resolve_context(
    db: DBClient,
    input_data: OrchestratorInput
) -> Result[ResolvedContext]:
    """
    Intelligently resolves missing IDs and normalises date/time.
    """
    try:
        tenant_id = input_data.tenant_id
        client_id = input_data.client_id
        
        # Try to get from entities if not explicitly provided
        provider_id = input_data.provider_id or get_entity(input_data.entities, "provider_id")
        service_id = input_data.service_id or get_entity(input_data.entities, "service_id")
        res_date = input_data.date or get_entity(input_data.entities, "date")
        res_time = input_data.time or get_entity(input_data.entities, "time")

        provider_name = get_entity(input_data.entities, "provider_name")
        specialty_name = get_entity(input_data.entities, "specialty_name")

        # 1. Intelligent Provider Resolution by Name
        if not provider_id and provider_name:
            # Note: ILIKE used for case-insensitive search
            rows = await db.fetch(
                "SELECT provider_id FROM providers WHERE name ILIKE $1 LIMIT 1",
                f"%{provider_name}%"
            )
            if rows:
                provider_id = str(rows[0]["provider_id"])

        # 2. Intelligent Service Resolution by Specialty Name
        if not service_id and specialty_name:
            rows = await db.fetch(
                """
                SELECT s.service_id 
                FROM services s
                JOIN specialties sp ON s.specialty_id = sp.specialty_id
                WHERE sp.name ILIKE $1
                LIMIT 1
                """,
                f"%{specialty_name}%"
            )
            if rows:
                service_id = str(rows[0]["service_id"])

        # 3. Date/Time Parsing
        if res_date:
            abs_date = resolve_date(res_date)
            if abs_date:
                res_date = abs_date
                
        if res_time:
            abs_time = resolve_time(res_time)
            if abs_time:
                res_time = abs_time

        # 4. Tenant Fallback
        # If no tenant is provided, we pick the first one as default or from the resolved provider
        if not tenant_id:
            if provider_id:
                tenant_id = provider_id
            else:
                rows = await db.fetch("SELECT provider_id FROM providers LIMIT 1")
                if rows:
                    tenant_id = str(rows[0]["provider_id"])
                    provider_id = tenant_id

        if not tenant_id:
            return Exception("Could not resolve tenant_id"), None

        # 5. Client Resolution by Telegram Chat ID
        if not client_id and input_data.telegram_chat_id:
            rows = await db.fetch(
                "SELECT client_id FROM clients WHERE telegram_chat_id = $1 LIMIT 1",
                input_data.telegram_chat_id
            )
            if rows:
                client_id = str(rows[0]["client_id"])
            else:
                # Auto-register client if chat_id known but not in DB
                name = input_data.telegram_name or "Usuario Telegram"
                rows = await db.fetch(
                    "INSERT INTO clients (name, telegram_chat_id) VALUES ($1, $2) RETURNING client_id",
                    name, input_data.telegram_chat_id
                )
                if rows:
                    client_id = str(rows[0]["client_id"])

        # 6. Service Fallback (Pick first service of the provider)
        if not service_id and provider_id:
            rows = await db.fetch(
                "SELECT service_id FROM services WHERE provider_id = $1::uuid LIMIT 1",
                provider_id
            )
            if rows:
                service_id = str(rows[0]["service_id"])

        return None, {
            "tenantId": tenant_id,
            "clientId": client_id,
            "providerId": provider_id,
            "serviceId": service_id,
            "date": res_date,
            "time": res_time,
        }
    except Exception as e:
        return Exception(f"Context resolution error: {e}"), None
