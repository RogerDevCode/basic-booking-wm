import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Register new user via web (hash password, validate RUT)
# DB Tables Used  : users
# Concurrency Risk: YES — handled by unique constraints
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_admin_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates all fields
# ============================================================================

from typing import Any
from ..internal._wmill_adapter import log
from ..internal._db_client import create_db_client
from ..internal._result import with_admin_context, Result, ok, fail
from ._register_models import InputSchema, RegisterResult
from ._register_logic import validate_rut, validate_password_strength, hash_password_sync

MODULE = "web_auth_register"

async def _main_async(args: dict[str, Any]) -> Result[RegisterResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    if input_data.password != input_data.password_confirm:
        return fail("Passwords do not match")

    pwd_err = validate_password_strength(input_data.password)
    if pwd_err:
        return fail(pwd_err)

    if not validate_rut(input_data.rut):
        return fail("Invalid Chilean RUT format or verification digit")

    conn = await create_db_client()
    try:
        async def operation() -> Result[RegisterResult]:
            # Check for existing user
            rows = await conn.fetch(
                "SELECT user_id FROM users WHERE email = $1 OR rut = $2 LIMIT 1",
                input_data.email, input_data.rut
            )
            if rows:
                return fail("A user with this email or RUT already exists")

            # Hash and Insert
            pwd_hash = hash_password_sync(input_data.password)
            
            insert_rows = await conn.fetch(
                """
                INSERT INTO users (
                  full_name, rut, email, address, phone, password_hash,
                  role, is_active, timezone
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, 'client', true, $7
                )
                RETURNING user_id, email, full_name, role
                """,
                input_data.full_name, input_data.rut, input_data.email,
                input_data.address, input_data.phone, pwd_hash, input_data.timezone
            )

            if not insert_rows:
                return fail("Failed to create user record")

            r = insert_rows[0]
            return ok({
                "user_id": str(r["user_id"]),
                "email": str(r["email"]),
                "full_name": str(r["full_name"]),
                "role": str(r["role"]),
            })

        return await with_admin_context(conn, operation)

    except Exception as e:
        msg = str(e)
        if "duplicate key" in msg or "unique constraint" in msg:
            return fail("A user with this email or RUT already exists")
        log("Internal error in register", error=msg, module=MODULE)
        return fail(f"Internal error: {e}")
    finally:
        await conn.close() # pyright: ignore[reportUnknownMemberType]


def main(args: dict) -> None:
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=os.path.basename(os.path.dirname(__file__)))
        except:
            from ..internal._wmill_adapter import log
            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
