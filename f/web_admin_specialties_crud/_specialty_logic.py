from datetime import datetime
from typing import Any

from ..internal._result import DBClient, Result, fail, ok
from ._specialty_models import InputSchema, SpecialtyRow


def map_row(r: dict[str, Any]) -> SpecialtyRow:
    return {
        "specialty_id": str(r["specialty_id"]),
        "name": str(r["name"]),
        "description": str(r["description"]) if r.get("description") else None,
        "category": str(r["category"]) if r.get("category") else None,
        "is_active": bool(r["is_active"]),
        "sort_order": int(r["sort_order"]),
        "created_at": r["created_at"].isoformat()
        if isinstance(r.get("created_at"), datetime)
        else str(r.get("created_at")),
    }


async def list_specialties(db: DBClient) -> Result[list[SpecialtyRow]]:
    try:
        rows = await db.fetch("SELECT * FROM specialties ORDER BY sort_order ASC, name ASC")
        return ok([map_row(r) for r in rows])
    except Exception as e:
        return fail(f"list_failed: {e}")


async def create_specialty(db: DBClient, input_data: InputSchema) -> Result[SpecialtyRow]:
    if not input_data.name:
        return fail("create_failed: name is required")
    try:
        rows = await db.fetch(
            """
            INSERT INTO specialties (name, description, category, sort_order)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            """,
            input_data.name,
            input_data.description,
            input_data.category or "Medicina",
            input_data.sort_order or 99,
        )
        if not rows:
            return fail("create_failed: no row returned")
        return ok(map_row(rows[0]))
    except Exception as e:
        return fail(f"create_failed: {e}")


async def update_specialty(db: DBClient, id: str, input_data: InputSchema) -> Result[SpecialtyRow]:
    try:
        fields = []
        params = []
        idx = 1

        for field in ["name", "description", "category", "sort_order"]:
            val = getattr(input_data, field)
            if val is not None:
                fields.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1

        if not fields:
            return fail("update_failed: no fields provided")

        params.append(id)
        query = f"UPDATE specialties SET {', '.join(fields)} WHERE specialty_id = ${idx}::uuid RETURNING *"
        rows = await db.fetch(query, *params)

        if not rows:
            return fail(f"update_failed: specialty {id} not found")
        return ok(map_row(rows[0]))
    except Exception as e:
        return fail(f"update_failed: {e}")


async def delete_specialty(db: DBClient, id: str) -> Result[dict[str, bool]]:
    try:
        await db.execute("DELETE FROM specialties WHERE specialty_id = $1::uuid", id)
        return ok({"deleted": True})
    except Exception as e:
        return fail(f"delete_failed: {e}")


async def set_status(db: DBClient, id: str, active: bool) -> Result[dict[str, Any]]:
    try:
        res = await db.execute("UPDATE specialties SET is_active = $1 WHERE specialty_id = $2::uuid", active, id)
        if "UPDATE 1" not in res:
            return fail(f"status_update_failed: specialty {id} not found")
        return ok({"specialty_id": id, "is_active": active})
    except Exception as e:
        return fail(f"status_update_failed: {e}")
