from __future__ import annotations

import random
import string
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Final

from ..internal._crypto import hash_password, validate_password_policy, verify_password

if TYPE_CHECKING:
    from ..internal._result import DBClient

# Constants
DEFAULT_PWD_LEN: Final[int] = 4


def generate_readable_password(length: int = DEFAULT_PWD_LEN) -> str:
    """Generates a simple readable alphanumeric password."""
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


async def admin_generate_temp_password(db: DBClient, input_data: object) -> dict[str, str]:
    from ._auth_models import InputSchema

    data = input_data if isinstance(input_data, InputSchema) else InputSchema.model_validate(input_data)
    rows = await db.fetch("SELECT name, email FROM providers WHERE provider_id = $1::uuid LIMIT 1", data.provider_id)
    if not rows:
        raise RuntimeError(f"Provider {data.provider_id} not found")

    provider = rows[0]
    temp_pwd = generate_readable_password(DEFAULT_PWD_LEN)
    pwd_hash = hash_password(temp_pwd)
    expires_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()

    await db.execute(
        """
        UPDATE providers
        SET password_hash = $1,
            password_reset_token = NULL,
            password_reset_expires = NULL,
            last_password_change = NOW(),
            updated_at = NOW()
        WHERE provider_id = $2::uuid
        """,
        pwd_hash,
        data.provider_id,
    )

    return {
        "provider_id": data.provider_id,
        "provider_name": str(provider["name"]),
        "tempPassword": temp_pwd,
        "expires_at": expires_at,
        "message": f"Temp password for {provider['name']}: {temp_pwd} (expires in 24h)",
    }


async def provider_change_password(db: DBClient, input_data: object) -> dict[str, str]:
    from ._auth_models import InputSchema

    data = input_data if isinstance(input_data, InputSchema) else InputSchema.model_validate(input_data)
    if not data.current_password or not data.new_password:
        raise RuntimeError("provider_change requires current_password and new_password")

    policy = validate_password_policy(data.new_password)
    if not policy["valid"]:
        raise RuntimeError(f"Password policy failed: {', '.join(policy['errors'])}")

    rows = await db.fetch("SELECT password_hash FROM providers WHERE provider_id = $1::uuid LIMIT 1", data.provider_id)
    if not rows or not rows[0].get("password_hash"):
        raise RuntimeError("Provider not found or no password set")

    stored_hash = str(rows[0]["password_hash"])
    if not verify_password(data.current_password, stored_hash):
        raise RuntimeError("Current password is incorrect")

    new_hash = hash_password(data.new_password)
    await db.execute(
        """
        UPDATE providers
        SET password_hash = $1,
            last_password_change = NOW(),
            updated_at = NOW()
        WHERE provider_id = $2::uuid
        """,
        new_hash,
        data.provider_id,
    )

    return {"provider_id": data.provider_id, "message": "Password changed successfully"}


async def provider_verify(db: DBClient, input_data: object) -> dict[str, str | bool | None]:
    from ._auth_models import InputSchema

    data = input_data if isinstance(input_data, InputSchema) else InputSchema.model_validate(input_data)
    if not data.current_password:
        raise RuntimeError("provider_verify requires current_password")

    rows = await db.fetch(
        "SELECT name, password_hash FROM providers WHERE provider_id = $1::uuid LIMIT 1", data.provider_id
    )
    if not rows:
        raise RuntimeError("Provider not found")

    p = rows[0]
    if not p.get("password_hash"):
        return {"provider_id": data.provider_id, "valid": False, "provider_name": str(p["name"])}

    stored_hash = str(p["password_hash"])
    is_valid = verify_password(data.current_password, stored_hash)
    return {"provider_id": data.provider_id, "valid": is_valid, "provider_name": str(p["name"])}
