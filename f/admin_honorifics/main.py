from __future__ import annotations

import asyncio
import os
from typing import TYPE_CHECKING, Any

from ..internal._db_client import create_db_client
from ..internal._result import (
    fail,
    ok,
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


async def main(args: dict[str, object]) -> Result[HonorificResult]:
    """Windmill entrypoint."""
    return await _main_async(args)
