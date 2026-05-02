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
from __future__ import annotations

from typing import TYPE_CHECKING

from ..internal._db_client import create_db_client
from ..internal._result import (
    fail,
    with_admin_context,
    with_tenant_context,
)
from ..internal._wmill_adapter import log
from ._honorifics_logic import (
    create_honorific,
    delete_honorific,
    list_honorifics,
    update_honorific,
)
from ._honorifics_models import InputSchema

if TYPE_CHECKING:
    from ..internal._result import Result
    from ._honorifics_models import HonorificRow

MODULE = "admin_honorifics"

type HonorificResult = list[HonorificRow] | HonorificRow | dict[str, bool]


async def _main_async(args: dict[str, object]) -> Result[HonorificResult]:
    """Main async entrypoint for honorifics management."""
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        if input_data.action == "list":
            # List is global (admin mode)
            async def list_op() -> Result[list[HonorificRow]]:
                return await list_honorifics(conn)

            return await with_admin_context(conn, list_op)

        # Mutations require tenant isolation
        async def operation() -> Result[HonorificRow | dict[str, bool]]:
            if input_data.action == "create":
                if not input_data.code or not input_data.label:
                    return fail("create_failed: code and label are required")
                return await create_honorific(
                    conn,
                    input_data.code,
                    input_data.label,
                    input_data.gender,
                    input_data.sort_order or 99,
                    input_data.is_active if input_data.is_active is not None else True,
                )
            elif input_data.action == "update":
                if not input_data.honorific_id:
                    return fail("update_failed: honorific_id is required")
                return await update_honorific(
                    conn,
                    input_data.honorific_id,
                    input_data.code,
                    input_data.label,
                    input_data.gender,
                    input_data.sort_order,
                    input_data.is_active,
                )
            elif input_data.action == "delete":
                if not input_data.honorific_id:
                    return fail("delete_failed: honorific_id is required")
                return await delete_honorific(conn, input_data.honorific_id)

            return fail(f"unsupported_action: {input_data.action}")

        # The union return type needs to be compatible with HonorificResult
        res: Result[HonorificResult] = await with_tenant_context(conn, input_data.tenant_id, operation)
        return res

    except Exception as e:
        log("Admin Honorifics Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
    finally:
        await conn.close()


def main(args: InputSchema | dict[str, object]) -> dict[str, object]:
    import asyncio
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
