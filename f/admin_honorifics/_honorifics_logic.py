from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, cast

from ..internal._result import fail, ok

if TYPE_CHECKING:
    from ..internal._result import DBClient, Result
    from ._honorifics_models import HonorificRow


def map_row(r: dict[str, object]) -> HonorificRow:
    """Maps a database row to a HonorificRow TypedDict."""
    val = r.get("created_at")
    created_at_str = val.isoformat() if isinstance(val, datetime) else str(val)
    
    return {
        "honorific_id": str(r["honorific_id"]),
        "code": str(r["code"]),
        "label": str(r["label"]),
        "gender": str(r["gender"]) if r.get("gender") else None,
        "sort_order": int(cast(int, r["sort_order"])),
        "is_active": bool(r["is_active"]),
        "created_at": created_at_str,
    }


async def list_honorifics(db: DBClient) -> Result[list[HonorificRow]]:
    """Lists all honorifics ordered by sort_order and label."""
    try:
        rows = await db.fetch("SELECT * FROM honorifics ORDER BY sort_order ASC, label ASC")
        return ok([map_row(r) for r in rows])
    except Exception as e:
        return fail(f"list_failed: {e}")


async def create_honorific(
    db: DBClient, code: str, label: str, gender: str | None, sort_order: int, is_active: bool
) -> Result[HonorificRow]:
    """Creates a new honorific."""
    try:
        rows = await db.fetch(
            """
            INSERT INTO honorifics (code, label, gender, sort_order, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            code,
            label,
            gender,
            sort_order,
            is_active,
        )
        if not rows:
            return fail("create_failed: no row returned")
        return ok(map_row(rows[0]))
    except Exception as e:
        return fail(f"create_failed: {e}")


async def update_honorific(
    db: DBClient,
    id: str,
    code: str | None,
    label: str | None,
    gender: str | None,
    sort_order: int | None,
    is_active: bool | None,
) -> Result[HonorificRow]:
    """Updates an existing honorific."""
    try:
        fields: list[str] = []
        params: list[object] = []
        idx = 1

        if code is not None:
            fields.append(f"code = ${idx}")
            params.append(code)
            idx += 1
        if label is not None:
            fields.append(f"label = ${idx}")
            params.append(label)
            idx += 1
        if gender is not None:
            fields.append(f"gender = ${idx}")
            params.append(gender)
            idx += 1
        if sort_order is not None:
            fields.append(f"sort_order = ${idx}")
            params.append(sort_order)
            idx += 1
        if is_active is not None:
            fields.append(f"is_active = ${idx}")
            params.append(is_active)
            idx += 1

        if not fields:
            return fail("update_failed: no fields provided")

        fields.append("updated_at = NOW()")
        params.append(id)

        query = f"UPDATE honorifics SET {', '.join(fields)} WHERE honorific_id = ${idx}::uuid RETURNING *"
        rows = await db.fetch(query, *params)

        if not rows:
            return fail(f"update_failed: honorific {id} not found")
        return ok(map_row(rows[0]))
    except Exception as e:
        return fail(f"update_failed: {e}")


async def delete_honorific(db: DBClient, id: str) -> Result[dict[str, bool]]:
    """Deletes an honorific by ID."""
    try:
        await db.execute("DELETE FROM honorifics WHERE honorific_id = $1::uuid", id)
        return ok({"deleted": True})
    except Exception as e:
        return fail(f"delete_failed: {e}")
