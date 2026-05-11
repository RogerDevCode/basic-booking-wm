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
# Mission         : User management CRUD + role change (admin-only)
# DB Tables Used  : users
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context for isolation
# Pydantic Schemas: YES — InputSchema validates action and fields
# ============================================================================
from typing import Any, cast

from ..internal._db_client import create_db_client
from ..internal._result import with_tenant_context
from ..internal._wmill_adapter import log
from ._user_logic import handle_user_actions
from ._user_models import InputSchema

MODULE = "web_admin_users"


async def _main_async(args: dict[str, Any]) -> dict[str, object]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        raise RuntimeError(f"Validation error: {e}") from e

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (admin_user_id)
        async def operation() -> object:
            # Verify Requesting Admin
            admin_rows = await conn.fetch(
                "SELECT role FROM users WHERE user_id = $1::uuid AND is_active = true LIMIT 1", input_data.admin_user_id
            )
            if not admin_rows or admin_rows[0]["role"] != "admin":
                raise RuntimeError("Forbidden: admin access required")

            return await handle_user_actions(conn, input_data)

        result = await with_tenant_context(conn, input_data.admin_user_id, operation)
        if result is None:
            raise RuntimeError("Admin users returned no result")
        return cast("dict[str, object]", result)

    except Exception as e:
        log("Admin Users Internal Error", error=str(e), module=MODULE)
        raise RuntimeError(f"internal_error: {e}") from e
    finally:
        await conn.close()  # pyright: ignore[reportUnknownMemberType]


def main(args: InputSchema | dict[str, object]) -> dict[str, object]:
    import traceback

    from pydantic import BaseModel

    try:
        if isinstance(args, InputSchema):
            validated = args
        else:
            validated = InputSchema.model_validate(args)

        result = asyncio.run(_main_async(validated.model_dump()))

        if result is None:
            return {}

        if isinstance(result, BaseModel):
            return result.model_dump()
        elif isinstance(result, dict):
            return result
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
