import asyncio

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Admin CRUD for tag categories and tags
# DB Tables Used  : tag_categories, tags, users
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context enforces isolation
# Pydantic Schemas: YES — InputSchema validates all parameters
# ============================================================================
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_tenant_context
from ..internal._wmill_adapter import log
from ._tags_logic import TagRepository, verify_admin_access
from ._tags_models import InputSchema

MODULE = "web_admin_tags"


async def _main_async(args: dict[str, Any]) -> Result[Any]:
    # 1. Validate Input
    try:
        input_data = InputSchema.model_validate(args)
    except Exception as e:
        return fail(f"VALIDATION_ERROR: {e}")

    conn = await create_db_client()
    try:
        # 2. Execute with Multi-Tenant Context
        async def operation() -> Result[Any]:
            # Verify Admin Access
            err_access, _ = await verify_admin_access(conn, input_data.admin_user_id)
            if err_access:
                return fail(err_access)

            repo = TagRepository(conn)
            action = input_data.action

            if action == "list_categories":
                return await repo.list_categories()
            elif action == "create_category":
                if not input_data.name:
                    return fail("REQUIRED: name")
                return await repo.create_category(input_data.name, input_data.description, input_data.sort_order or 0)
            elif action == "update_category":
                if not input_data.category_id:
                    return fail("REQUIRED: category_id")
                return await repo.update_category(input_data.category_id, input_data)
            elif action == "delete_category":
                if not input_data.category_id:
                    return fail("REQUIRED: category_id")
                return await repo.delete_category(input_data.category_id)
            elif action == "activate_category" or action == "deactivate_category":
                if not input_data.category_id:
                    return fail("REQUIRED: category_id")
                return await repo.set_category_status(input_data.category_id, action == "activate_category")

            elif action == "list_tags":
                return await repo.list_tags(input_data.category_id)
            elif action == "create_tag":
                if not input_data.category_id or not input_data.name:
                    return fail("REQUIRED: category_id, name")
                return await repo.create_tag(
                    input_data.category_id,
                    input_data.name,
                    input_data.description,
                    input_data.color or "#808080",
                    input_data.sort_order or 0,
                )
            elif action == "update_tag":
                if not input_data.tag_id:
                    return fail("REQUIRED: tag_id")
                return await repo.update_tag(input_data.tag_id, input_data)
            elif action == "delete_tag":
                if not input_data.tag_id:
                    return fail("REQUIRED: tag_id")
                return await repo.delete_tag(input_data.tag_id)
            elif action == "activate_tag" or action == "deactivate_tag":
                if not input_data.tag_id:
                    return fail("REQUIRED: tag_id")
                return await repo.set_tag_status(input_data.tag_id, action == "activate_tag")

            elif action == "list_all":
                err_c, cats = await repo.list_categories()
                if err_c:
                    return fail(err_c)
                err_t, tags = await repo.list_tags()
                if err_t:
                    return fail(err_t)
                return ok({"categories": cats, "tags": tags})

            return fail(f"UNKNOWN_ACTION: {action}")

        return await with_tenant_context(conn, input_data.admin_user_id, operation)

    except Exception as e:
        log("Admin Tags Internal Error", error=str(e), module=MODULE)
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
