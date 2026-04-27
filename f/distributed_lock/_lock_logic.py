from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, cast

from ..internal._result import DBClient, Result, fail, ok

if TYPE_CHECKING:
    from ._lock_models import InputSchema, LockInfo, LockResult


def map_row_to_lock_info(row: object) -> LockInfo:
    r = cast("dict[str, object]", row)

    def to_iso(val: object) -> str:
        if isinstance(val, datetime):
            return val.isoformat()
        return str(val)

    return {
        "lock_id": str(r["lock_id"]),
        "lock_key": str(r["lock_key"]),
        "owner_token": str(r["owner_token"]),
        "provider_id": str(r["provider_id"]),
        "start_time": to_iso(r.get("start_time")),
        "acquired_at": to_iso(r.get("acquired_at")),
        "expires_at": to_iso(r.get("expires_at")),
    }


async def acquire_lock(db: DBClient, input_data: InputSchema) -> Result[LockResult]:
    if not input_data.owner_token or not input_data.start_time:
        return fail("acquire_failed: owner_token and start_time are required")

    expires_at = datetime.now(UTC) + timedelta(seconds=input_data.ttl_seconds)

    # 1. Try insert
    rows = await db.fetch(
        """
        INSERT INTO booking_locks (lock_key, owner_token, provider_id, start_time, expires_at)
        VALUES ($1, $2, $3::uuid, $4::timestamptz, $5::timestamptz)
        ON CONFLICT (lock_key) DO NOTHING
        RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
        """,
        input_data.lock_key,
        input_data.owner_token,
        input_data.provider_id,
        input_data.start_time,
        expires_at,
    )

    if rows:
        return ok({"acquired": True, "lock": map_row_to_lock_info(rows[0])})

    # 2. Try steal expired
    rows = await db.fetch(
        """
        UPDATE booking_locks
        SET owner_token = $1,
            expires_at = $2::timestamptz,
            acquired_at = NOW(),
            start_time = $3::timestamptz
        WHERE lock_key = $4
          AND expires_at < NOW()
        RETURNING lock_id, lock_key, owner_token, provider_id, start_time, acquired_at, expires_at
        """,
        input_data.owner_token,
        expires_at,
        input_data.start_time,
        input_data.lock_key,
    )

    if rows:
        return ok({"acquired": True, "lock": map_row_to_lock_info(rows[0])})

    res: LockResult = {"acquired": False, "reason": "lock_already_held"}
    return ok(res)


async def release_lock(db: DBClient, input_data: InputSchema) -> Result[LockResult]:
    if not input_data.owner_token:
        return fail("release_failed: owner_token is required")

    rows = await db.fetch(
        "DELETE FROM booking_locks WHERE lock_key = $1 AND owner_token = $2 RETURNING lock_key",
        input_data.lock_key,
        input_data.owner_token,
    )

    if not rows:
        res_fail: LockResult = {"released": False, "reason": "lock_not_found_or_unauthorized"}
        return ok(res_fail)

    res_ok: LockResult = {"released": True}
    return ok(res_ok)


async def check_lock(db: DBClient, lock_key: str) -> Result[LockResult]:
    rows = await db.fetch(
        """
        SELECT owner_token, expires_at FROM booking_locks
        WHERE lock_key = $1 AND expires_at > NOW()
        LIMIT 1
        """,
        lock_key,
    )
    if not rows:
        res_no: LockResult = {"locked": False}
        return ok(res_no)

    r = rows[0]
    exp = r["expires_at"].isoformat() if isinstance(r.get("expires_at"), datetime) else str(r.get("expires_at"))
    res_yes: LockResult = {"locked": True, "owner": str(r["owner_token"]), "expires_at": exp}
    return ok(res_yes)


async def cleanup_locks(db: DBClient) -> Result[LockResult]:
    rows = await db.fetch("DELETE FROM booking_locks WHERE expires_at < NOW() RETURNING lock_key")
    res: LockResult = {"cleaned": len(rows)}
    return ok(res)
