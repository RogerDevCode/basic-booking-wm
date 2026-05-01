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

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Service health monitor and failure isolation
# DB Tables Used  : circuit_breaker_state
# Concurrency Risk: YES — atomic updates
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : NO — infrastructure table
# Pydantic Schemas: YES — InputSchema validates actions
# ============================================================================
from datetime import UTC, datetime

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_admin_context
from ..internal._wmill_adapter import log
from ._circuit_logic import get_state, init_service
from ._circuit_models import CircuitBreakerResult, CircuitState, InputSchema

MODULE = "circuit_breaker"


async def _main_async(args: dict[str, object]) -> Result[CircuitBreakerResult | CircuitState]:
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:

        async def operation() -> Result[CircuitBreakerResult | CircuitState]:
            await init_service(conn, input_data.service_id)

            if input_data.action == "check":
                state = await get_state(conn, input_data.service_id)
                if not state:
                    return ok({"allowed": True, "state": "closed"})

                if state["state"] == "open" and state["opened_at"]:
                    opened_at = datetime.fromisoformat(state["opened_at"].replace("Z", "+00:00"))
                    elapsed = (datetime.now(UTC) - opened_at).total_seconds()
                    if elapsed >= state["timeout_seconds"]:
                        await conn.execute(
                            "UPDATE circuit_breaker_state SET state = 'half-open', half_open_at = NOW(), failure_count = 0 WHERE service_id = $1",  # noqa: E501
                            input_data.service_id,
                        )
                        return ok({"allowed": True, "state": "half-open"})
                    return ok({"allowed": False, "state": "open", "retry_after": state["timeout_seconds"] - elapsed})

                return ok({"allowed": state["state"] != "open", "state": state["state"]})

            elif input_data.action == "record_success":
                await conn.execute(
                    "UPDATE circuit_breaker_state SET success_count = success_count + 1, failure_count = 0, last_success_at = NOW(), updated_at = NOW() WHERE service_id = $1",  # noqa: E501
                    input_data.service_id,
                )
                state = await get_state(conn, input_data.service_id)
                if state and state["state"] == "half-open" and state["success_count"] >= state["success_threshold"]:
                    await conn.execute(
                        "UPDATE circuit_breaker_state SET state = 'closed', success_count = 0, failure_count = 0, opened_at = null, half_open_at = null, updated_at = NOW() WHERE service_id = $1",  # noqa: E501
                        input_data.service_id,
                    )
                return ok({"state": "success recorded"})

            elif input_data.action == "record_failure":
                await conn.execute(
                    "UPDATE circuit_breaker_state SET failure_count = failure_count + 1, success_count = 0, last_failure_at = NOW(), last_error_message = $1, updated_at = NOW() WHERE service_id = $2",  # noqa: E501
                    input_data.error_message,
                    input_data.service_id,
                )
                state = await get_state(conn, input_data.service_id)
                if state and state["failure_count"] >= state["failure_threshold"] and state["state"] != "open":
                    await conn.execute(
                        "UPDATE circuit_breaker_state SET state = 'open', opened_at = NOW(), updated_at = NOW() WHERE service_id = $1",  # noqa: E501
                        input_data.service_id,
                    )
                    return ok({"state": "opened", "message": f"Circuit opened for {input_data.service_id}"})
                return ok({"state": "failure recorded", "failure_count": state["failure_count"] if state else 0})

            elif input_data.action == "reset":
                await conn.execute(
                    "UPDATE circuit_breaker_state SET state = 'closed', failure_count = 0, success_count = 0, opened_at = null, half_open_at = null, last_error_message = null, updated_at = NOW() WHERE service_id = $1",  # noqa: E501
                    input_data.service_id,
                )
                return ok({"state": "reset"})

            elif input_data.action == "status":
                state = await get_state(conn, input_data.service_id)
                if not state:
                    return fail("State not found")
                return ok(state)

            return fail(f"Unsupported action: {input_data.action}")

        return await with_admin_context(conn, operation)

    except Exception as e:
        log("Circuit Breaker Internal Error", error=str(e), module=MODULE)
        return fail(f"Internal error: {e}")
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
