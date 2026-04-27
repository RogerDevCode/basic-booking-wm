import asyncio

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Get current user profile + role by user_id
# DB Tables Used  : users
# Concurrency Risk: NO — read-only
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates user_id
# ============================================================================
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, with_tenant_context
from ..internal._wmill_adapter import log
from ._me_logic import get_user_profile
from ._me_models import InputSchema, UserProfileResult

MODULE = "web_auth_me"


async def _main_async(args: dict[str, Any]) -> Result[UserProfileResult]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context
        async def operation() -> Result[UserProfileResult]:
            return await get_user_profile(conn, input_data.user_id)

        return await with_tenant_context(conn, input_data.user_id, operation)

    except Exception as e:
        log("Internal error in web_auth_me", error=str(e), module=MODULE)
        return fail(f"Internal error: {e}")
    finally:
        await conn.close()  # pyright: ignore[reportUnknownMemberType]


def main(args: dict) -> None:
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
