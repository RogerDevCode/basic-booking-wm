# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0"
# ]
# ///
import asyncio

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Admin-only user role change
# DB Tables Used  : users
# Concurrency Risk: NO — single-row UPDATE
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates roles and IDs
# ============================================================================
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_tenant_context
from ..internal._wmill_adapter import log
from ._change_role_models import ChangeRoleResult, InputSchema

MODULE = "web_auth_change_role"


async def _main_async(args: dict[str, Any]) -> Result[ChangeRoleResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (using admin_user_id as tenant)
        async def operation() -> Result[ChangeRoleResult]:
            # Verify Admin
            admin_rows = await conn.fetch(
                "SELECT role FROM users WHERE user_id = $1::uuid AND is_active = True LIMIT 1", input_data.admin_user_id
            )
            if not admin_rows or admin_rows[0]["role"] != "admin":
                return fail("Forbidden: only active admins can change user roles")

            # Fetch Target User
            target_rows = await conn.fetch(
                "SELECT user_id, full_name, role FROM users WHERE user_id = $1::uuid LIMIT 1", input_data.target_user_id
            )
            if not target_rows:
                return fail("Target user not found")

            target = target_rows[0]
            old_role = str(target["role"])

            if old_role == input_data.new_role:
                return ok(
                    {
                        "user_id": str(target["user_id"]),
                        "full_name": str(target["full_name"]),
                        "old_role": old_role,
                        "new_role": input_data.new_role,
                    }
                )

            # Update Role
            update_rows = await conn.fetch(
                """
                UPDATE users SET role = $1, updated_at = NOW()
                WHERE user_id = $2::uuid
                RETURNING user_id, full_name
                """,
                input_data.new_role,
                input_data.target_user_id,
            )

            if not update_rows:
                return fail("Failed to update user role")

            upd = update_rows[0]
            return ok(
                {
                    "user_id": str(upd["user_id"]),
                    "full_name": str(upd["full_name"]),
                    "old_role": old_role,
                    "new_role": input_data.new_role,
                }
            )

        return await with_tenant_context(conn, input_data.admin_user_id, operation)

    except Exception as e:
        log("Internal error in change_role", error=str(e), module=MODULE)
        return fail(f"Internal error: {e}")
    finally:
        await conn.close()  # pyright: ignore[reportUnknownMemberType]


def main(args: InputSchema | dict[str, object]) -> dict[str, object]:
    import traceback
    from typing import cast

    from pydantic import BaseModel

    try:
        if isinstance(args, InputSchema):
            validated = args
        else:
            validated = InputSchema.model_validate(args)
            
        err, result = asyncio.run(_main_async(validated.model_dump()))
        if err:
            raise err
            
        if result is None:
            return {}
        
        if isinstance(result, BaseModel):
            return cast("dict[str, object]", result.model_dump())
        elif isinstance(result, dict):
            return cast("dict[str, object]", result)
        else:
            return {"data": result}
            
    except Exception as e:
        tb = traceback.format_exc()
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=MODULE)
        except Exception:
            pass
        raise RuntimeError(f"Execution failed: {e}") from e
