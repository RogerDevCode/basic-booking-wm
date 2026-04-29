import asyncio

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Authenticate email+password, return session + role
# DB Tables Used  : users
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_admin_context bypasses RLS for user discovery
# Pydantic Schemas: YES — InputSchema validates email and password
# ============================================================================
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_admin_context
from ..internal._wmill_adapter import log
from ._login_logic import verify_password_sync
from ._login_models import InputSchema, LoginResult, UserRow

MODULE = "web_auth_login"


async def _main_async(args: dict[str, Any]) -> Result[LoginResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute Auth Transaction with Admin Context (bypass RLS)
        async def operation() -> Result[LoginResult]:
            # Lookup user by email
            rows = await conn.fetch(
                """
                SELECT user_id, email, full_name, role, password_hash, is_active,
                       CASE WHEN rut IS NOT NULL AND email IS NOT NULL AND password_hash IS NOT NULL
                            THEN true ELSE false END AS profile_complete
                FROM users
                WHERE email = $1
                LIMIT 1
                """,
                input_data.email,
            )

            if not rows:
                return fail("Invalid email or password")

            r = rows[0]
            user: UserRow = {
                "user_id": str(r["user_id"]),
                "email": str(r["email"]),
                "full_name": str(r["full_name"]),
                "role": str(r["role"]),
                "password_hash": str(r["password_hash"]),
                "is_active": bool(r["is_active"]),
                "profile_complete": bool(r["profile_complete"]),
            }

            # Check account status
            if not user["is_active"]:
                return fail("Account is disabled. Contact support.")

            # Verify password
            if not user["password_hash"] or user["password_hash"] == "null":
                return fail("Invalid email or password")

            if not verify_password_sync(input_data.password, user["password_hash"]):
                return fail("Invalid email or password")

            # Success: Update last login
            await conn.execute("UPDATE users SET last_login = NOW() WHERE user_id = $1::uuid", user["user_id"])

            return ok(
                {
                    "user_id": user["user_id"],
                    "email": user["email"],
                    "full_name": user["full_name"],
                    "role": user["role"],
                    "profile_complete": user["profile_complete"],
                }
            )

        return await with_admin_context(conn, operation)

    except Exception as e:
        log("Internal error in login", error=str(e), module=MODULE)
        return fail(f"Internal error: {e}")
    finally:
        await conn.close()  # pyright: ignore[reportUnknownMemberType]


def main(args: dict[str, Any]) -> Result[LoginResult]:
    import traceback

    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log

            log(
                "CRITICAL_ENTRYPOINT_ERROR",
                error=str(e),
                traceback=tb,
                module=MODULE,
            )
        except Exception:
            from ..internal._wmill_adapter import log

            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")

        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}") from e
