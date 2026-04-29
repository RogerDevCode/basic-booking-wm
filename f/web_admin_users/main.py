import asyncio

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : User management CRUD + role change (admin-only)
# DB Tables Used  : users
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context for isolation
# Pydantic Schemas: YES — InputSchema validates action and fields
# ============================================================================
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ..internal._wmill_adapter import log
from ._user_logic import handle_user_actions
from ._user_models import InputSchema

MODULE = "web_admin_users"


async def _main_async(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (admin_user_id)
        async def operation() -> Result[Any]:
            # Verify Requesting Admin
            admin_rows = await conn.fetch(
                "SELECT role FROM users WHERE user_id = $1::uuid AND is_active = true LIMIT 1", input_data.admin_user_id
            )
            if not admin_rows or admin_rows[0]["role"] != "admin":
                return fail("Forbidden: admin access required")

            return await handle_user_actions(conn, input_data)

        return await with_tenant_context(conn, input_data.admin_user_id, operation)

    except Exception as e:
        log("Admin Users Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()  # pyright: ignore[reportUnknownMemberType]


def main(args: dict[str, Any]) -> Result[Any]:
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
