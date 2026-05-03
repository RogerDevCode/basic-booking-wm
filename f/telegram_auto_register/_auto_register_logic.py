from __future__ import annotations

import secrets
from typing import TYPE_CHECKING

from ..internal._crypto import hash_password
from ..internal._result import DBClient, Result, fail, ok

if TYPE_CHECKING:
    from ._auto_register_models import InputSchema, RegisterResult


async def _upsert_client(db: DBClient, chat_id: str, full_name: str) -> str | None:
    """UPSERT a clients booking-profile row keyed on telegram_chat_id, return client_id."""
    rows = await db.fetch("SELECT client_id FROM clients WHERE telegram_chat_id = $1 LIMIT 1", chat_id)
    if rows:
        return str(rows[0]["client_id"])

    new_rows = await db.fetch(
        """
        INSERT INTO clients (name, telegram_chat_id)
        VALUES ($1, $2)
        RETURNING client_id
        """,
        full_name,
        chat_id,
    )
    return str(new_rows[0]["client_id"]) if new_rows else None


async def register_telegram_user(db: DBClient, input_data: InputSchema) -> Result[RegisterResult]:
    full_name = f"{input_data.first_name} {input_data.last_name or ''}".strip()

    # 1. Check for existing auth user by chat_id
    rows = await db.fetch("SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1", input_data.chat_id)

    is_new = not rows

    if rows:
        user_id = str(rows[0]["user_id"])
    else:
        # 2. Create new auth user
        temp_pwd = secrets.token_hex(32)
        pwd_hash = hash_password(temp_pwd)

        insert_rows = await db.fetch(
            """
            INSERT INTO users (
                full_name, telegram_chat_id, role, password_hash,
                is_active
            ) VALUES (
                $1, $2, 'client', $3, true
            )
            RETURNING user_id
            """,
            full_name,
            input_data.chat_id,
            pwd_hash,
        )
        if not insert_rows:
            return fail("Failed to create user record")
        user_id = str(insert_rows[0]["user_id"])

    # 3. Also UPSERT a clients booking-profile (separate table, keyed by telegram_chat_id)
    client_id = await _upsert_client(db, input_data.chat_id, full_name)
    if not client_id:
        return fail("Failed to create client record")

    return ok({"user_id": user_id, "client_id": client_id, "is_new": is_new})
