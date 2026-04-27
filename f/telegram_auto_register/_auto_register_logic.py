import secrets

from ..internal._crypto import hash_password
from ..internal._result import DBClient, Result, fail, ok
from ._auto_register_models import InputSchema, RegisterResult


async def register_telegram_user(db: DBClient, input_data: InputSchema) -> Result[RegisterResult]:
    full_name = f"{input_data.first_name} {input_data.last_name or ''}".strip()

    # 1. Check for existing user by chat_id
    rows = await db.fetch("SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1", input_data.chat_id)

    if rows:
        return ok({"user_id": str(rows[0]["user_id"]), "is_new": False})

    # 2. Create new user if not found
    # Generate a secure random password for internal use (profile incomplete)
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

    return ok({"user_id": str(insert_rows[0]["user_id"]), "is_new": True})
