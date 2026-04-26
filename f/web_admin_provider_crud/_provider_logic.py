from typing import Any, TypedDict
from datetime import datetime
from typing import List, Optional, Dict, cast
from ..internal._result import Result, DBClient, ok, fail
from ..internal._crypto import hash_password
from ..auth_provider._auth_logic import generate_readable_password
from ._provider_models import ProviderRow, CreateProviderResult, InputSchema

class ProviderDBRow(TypedDict, total=False):
    id: int
    honorific_id: int | None
    name: str
    email: str
    specialty_id: int | None
    timezone_id: int | None
    phone_app: str | None
    phone_contact: str | None
    telegram_chat_id: str | None
    gcal_calendar_id: str | None
    address_street: str | None
    address_number: str | None
    address_complement: str | None
    address_sector: str | None
    region_id: int | None
    commune_id: int | None
    is_active: bool
    has_password: bool
    last_password_change: datetime | None
    created_at: datetime
    updated_at: datetime
    honorific_label: str | None
    specialty_name: str | None
    timezone_name: str | None
    region_name: str | None
    commune_name: str | None

def map_row(r: ProviderDBRow) -> ProviderRow:
    return {
        "id": str(r["id"]),
        "honorific_id": str(r["honorific_id"]) if r.get("honorific_id") else None,
        "name": str(r["name"]),
        "email": str(r["email"]),
        "specialty_id": str(r["specialty_id"]) if r.get("specialty_id") else None,
        "timezone_id": int(r["timezone_id"]) if r.get("timezone_id") else None,
        "phone_app": str(r["phone_app"]) if r.get("phone_app") else None,
        "phone_contact": str(r["phone_contact"]) if r.get("phone_contact") else None,
        "telegram_chat_id": str(r["telegram_chat_id"]) if r.get("telegram_chat_id") else None,
        "gcal_calendar_id": str(r["gcal_calendar_id"]) if r.get("gcal_calendar_id") else None,
        "address_street": str(r["address_street"]) if r.get("address_street") else None,
        "address_number": str(r["address_number"]) if r.get("address_number") else None,
        "address_complement": str(r["address_complement"]) if r.get("address_complement") else None,
        "address_sector": str(r["address_sector"]) if r.get("address_sector") else None,
        "region_id": int(r["region_id"]) if r.get("region_id") else None,
        "commune_id": int(r["commune_id"]) if r.get("commune_id") else None,
        "is_active": bool(r["is_active"]),
        "has_password": bool(r.get("has_password")),
        "last_password_change": r["last_password_change"].isoformat() if isinstance(r.get("last_password_change"), datetime) else str(r.get("last_password_change")) if r.get("last_password_change") else None,
        "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at")),
        "updated_at": r["updated_at"].isoformat() if isinstance(r.get("updated_at"), datetime) else str(r.get("updated_at")),
        "honorific_label": str(r["honorific_label"]) if r.get("honorific_label") else None,
        "specialty_name": str(r["specialty_name"]) if r.get("specialty_name") else None,
        "timezone_name": str(r["timezone_name"]) if r.get("timezone_name") else None,
        "region_name": str(r["region_name"]) if r.get("region_name") else None,
        "commune_name": str(r["commune_name"]) if r.get("commune_name") else None,
    }

async def list_providers(db: DBClient) -> Result[List[ProviderRow]]:
    try:
        rows = await db.fetch(
            """
            SELECT
              p.*,
              (p.password_hash IS NOT NULL) AS has_password,
              h.label AS honorific_label,
              s.name AS specialty_name,
              t.name AS timezone_name,
              r.name AS region_name,
              c.name AS commune_name
            FROM providers p
            LEFT JOIN honorifics h ON h.honorific_id = p.honorific_id
            LEFT JOIN specialties s ON s.specialty_id = p.specialty_id
            LEFT JOIN timezones t ON t.id = p.timezone_id
            LEFT JOIN regions r ON r.region_id = p.region_id
            LEFT JOIN communes c ON c.commune_id = p.commune_id
            ORDER BY p.name ASC
            """
        )
        return ok([map_row(r) for r in rows])
    except Exception as e:
        return fail(f"list_failed: {e}")

async def create_provider(db: DBClient, input_data: InputSchema) -> Result[CreateProviderResult]:
    if not input_data.name or not input_data.email:
        return fail("create_failed: name and email are required")
    
    temp_pwd = generate_readable_password(4)
    pwd_hash = hash_password(temp_pwd)

    try:
        rows = await db.fetch(
            """
            INSERT INTO providers (
              name, email, specialty_id, honorific_id, timezone_id,
              phone_app, phone_contact, telegram_chat_id, gcal_calendar_id,
              address_street, address_number, address_complement, address_sector,
              region_id, commune_id, is_active, password_hash, last_password_change
            ) VALUES (
              $1, $2, $3::uuid, $4::uuid, $5,
              $6, $7, $8, $9,
              $10, $11, $12, $13,
              $14, $15, $16, $17, NOW()
            )
            RETURNING *
            """,
            input_data.name, input_data.email, input_data.specialty_id, input_data.honorific_id, input_data.timezone_id,
            input_data.phone_app, input_data.phone_contact, input_data.telegram_chat_id, input_data.gcal_calendar_id,
            input_data.address_street, input_data.address_number, input_data.address_complement, input_data.address_sector,
            input_data.region_id, input_data.commune_id, input_data.is_active if input_data.is_active is not None else True,
            pwd_hash
        )
        if not rows: return fail("create_failed: no row returned")
        
        # Merge created row with metadata
        row_data = dict(rows[0])
        row_data["has_password"] = True
        res = map_row(row_data)
        
        full_res = cast(CreateProviderResult, res)
        full_res["temp_password"] = temp_pwd
        return ok(full_res)
    except Exception as e:
        return fail(f"create_failed: {e}")

async def update_provider(db: DBClient, id: str, input_data: InputSchema) -> Result[ProviderRow]:
    try:
        fields = []
        params = []
        idx = 1
        
        for field in ["name", "email", "timezone_id", "phone_app", "phone_contact", 
                      "telegram_chat_id", "gcal_calendar_id", "address_street", "address_number",
                      "address_complement", "address_sector", "region_id", "commune_id", "is_active"]:
            val = getattr(input_data, field)
            if val is not None:
                fields.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1
        
        if input_data.specialty_id is not None:
            fields.append(f"specialty_id = ${idx}::uuid")
            params.append(input_data.specialty_id)
            idx += 1
        
        if input_data.honorific_id is not None:
            fields.append(f"honorific_id = ${idx}::uuid")
            params.append(input_data.honorific_id)
            idx += 1
            
        if not fields: return fail("update_failed: no fields provided")
        
        fields.append("updated_at = NOW()")
        params.append(id)
        
        query = f"UPDATE providers SET {', '.join(fields)} WHERE id = ${idx}::uuid RETURNING *"
        rows = await db.fetch(query, *params)
        
        if not rows: return fail(f"update_failed: provider {id} not found")
        return ok(map_row(rows[0]))
    except Exception as e:
        return fail(f"update_failed: {e}")

async def reset_provider_password(db: DBClient, id: str) -> Result[Dict[str, Any]]:
    temp_pwd = generate_readable_password(4)
    pwd_hash = hash_password(temp_pwd)
    try:
        await db.execute(
            "UPDATE providers SET password_hash = $1, last_password_change = NOW(), updated_at = NOW() WHERE id = $2::uuid",
            pwd_hash, id
        )
        return ok({
            "provider_id": id,
            "temp_password": temp_pwd,
            "message": f"New temp password: {temp_pwd} (expires in 24h, must change on first login)"
        })
    except Exception as e:
        return fail(f"reset_failed: {e}")
