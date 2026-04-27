import asyncio

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Provider self-service profile management (get/update/change password)
# DB Tables Used  : providers, honorifics, specialties, timezones, regions, communes
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates action and provider fields
# ============================================================================
from typing import Any

from ..internal._crypto import hash_password, validate_password_policy, verify_password
from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_tenant_context
from ..internal._wmill_adapter import log
from ._profile_logic import ProfileRepository
from ._profile_models import InputSchema

MODULE = "web_provider_profile"


async def _main_async(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"Validation error: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute within Tenant Context (provider_id)
        async def operation() -> Result[Any]:
            repo = ProfileRepository(conn)
            action = input_data.action

            if action == "get_profile":
                return await repo.find_by_id(input_data.provider_id)

            elif action == "update_profile":
                err_up, _ = await repo.update(input_data.provider_id, input_data)
                if err_up:
                    return fail(err_up)
                return await repo.find_by_id(input_data.provider_id)

            elif action == "change_password":
                if not input_data.current_password or not input_data.new_password:
                    return fail("missing_password_fields")

                # 1. Validate Policy
                policy = validate_password_policy(input_data.new_password)
                if not policy["valid"]:
                    return fail(f"policy_violation: {', '.join(policy['errors'])}")

                # 2. Verify Current
                err_h, cur_hash = await repo.get_password_hash(input_data.provider_id)
                if err_h or not cur_hash:
                    return fail(err_h or "password_hash_not_found")

                if not verify_password(input_data.current_password, cur_hash):
                    return fail("invalid_current_password")

                # 3. Update
                new_h = hash_password(input_data.new_password)
                err_pwd, _ = await repo.update_password(input_data.provider_id, new_h)
                if err_pwd:
                    return fail(err_pwd)

                return ok({"success": True, "message": "password_changed"})

            return fail(f"Unsupported action: {action}")

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Provider Profile Internal Error", error=str(e), module=MODULE)
        return fail(f"internal_error: {e}")
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
