import asyncio

# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Clinical notes CRUD with AES-256-GCM encryption at rest
# DB Tables Used  : service_notes, note_tags, tags
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : YES — with_tenant_context wraps all DB ops
# Pydantic Schemas: YES — InputSchema validates action and fields
# ============================================================================
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, fail, ok, with_tenant_context
from ..internal._wmill_adapter import log
from ._notes_logic import NoteRepository
from ._notes_models import InputSchema

MODULE = "web_provider_notes"


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
            repo = NoteRepository(conn)
            action = input_data.action

            if action == "create":
                if not input_data.booking_id or not input_data.client_id or not input_data.content:
                    return fail("create requires booking_id, client_id, and content")
                return await repo.create(
                    input_data.provider_id,
                    input_data.booking_id,
                    input_data.client_id,
                    input_data.content,
                    input_data.tag_ids,
                )
            elif action == "read":
                if not input_data.note_id:
                    return fail("read requires note_id")
                return await repo.read(input_data.provider_id, input_data.note_id)
            elif action == "list":
                notes_res = await repo.list_notes(input_data.provider_id, input_data.booking_id)
                if notes_res[0]:
                    return fail(notes_res[0])
                notes = notes_res[1] or []
                return ok({"notes": notes, "count": len(notes)})
            elif action == "delete":
                if not input_data.note_id:
                    return fail("delete requires note_id")
                return await repo.delete(input_data.provider_id, input_data.note_id)
            elif action == "update":
                # Simplified update for this phase (re-implement if needed)
                return fail("update_not_implemented_in_python_yet")

            return fail(f"Unsupported action: {action}")

        return await with_tenant_context(conn, input_data.provider_id, operation)

    except Exception as e:
        log("Provider Notes Internal Error", error=str(e), module=MODULE)
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
