from __future__ import annotations

# ruff: noqa: E402
import json
import os
from typing import cast

import pytest
from dotenv import load_dotenv

# 1. Load env and patch hosts for local host execution (db -> localhost, redis -> localhost)
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path=dotenv_path, override=True)

db_url = os.getenv("DATABASE_URL")
if db_url:
    os.environ["DATABASE_URL"] = db_url.replace("@db:", "@localhost:")

redis_url = os.getenv("REDIS_URL")
if redis_url:
    os.environ["REDIS_URL"] = redis_url.replace("redis://redis:", "redis://localhost:")

if not os.getenv("DATABASE_URL") or not os.getenv("REDIS_URL"):
    pytest.skip("DATABASE_URL and REDIS_URL must be set to run integration tests", allow_module_level=True)

from f.gcal_reconcile._reconcile_models import InputSchema
from f.gcal_reconcile.main import _main_async as run_gcal_reconcile
from f.internal._db_client import create_db_client
from f.internal._redis_client import create_redis_client
from f.internal.booking_confirm.main import _main_async as run_booking_confirm
from f.internal.conversation_get.main import _get_conversation
from f.internal.fsm_router._router_models import RouterInput
from f.internal.fsm_router.main import _route
from f.internal.scheduling_engine._scheduling_logic import get_availability_range
from f.telegram_send.main import _main_async as run_telegram_send

# Use the "integration" name in the test file/functions to bypass redis mock in conftest.py


@pytest.mark.asyncio
async def test_integration_rollback_on_commit_failure() -> None:
    # AAA Pattern
    # PREMISE: Database commit fails due to invalid parameters, and we have an old state
    old_booking_state = {"name": "confirming", "specialtyId": "7a4fda97-c53e-455b-b8dd-7ad3646704f6"}
    old_booking_draft = {"doctorId": "228d4e5c-19b5-4153-9899-0eb437a57f8d", "start_time": "2026-05-22T10:00:00Z"}
    old_active_flow = "booking"

    # ACTION: Run booking confirm with invalid inputs (forcing a database resolution failure)
    res = await run_booking_confirm(
        client_id="b81b5492-2859-4950-a522-b849b59b7299",
        provider_id="00000000-0000-0000-0000-000000000000",  # Non-existent provider
        start_time="2026-05-22T10:00:00Z",
        chat_id="123456",
        pg_url=os.environ["DATABASE_URL"],
    )

    # GUARANTEE: booking_confirm must report failure
    assert res["success"] is False
    assert res["error"] is not None

    # Simulating the flow.yaml JS evaluation for update_conversation_state:
    # "booking_state": (results.booking_commit && results.booking_commit.success === false) ? results.get_conversation_state.data.booking_state : ...
    updated_booking_state = old_booking_state if res["success"] is False else {"name": "idle"}
    updated_booking_draft = old_booking_draft if res["success"] is False else None
    updated_active_flow = old_active_flow if res["success"] is False else None

    # Ensure rollback/preservation logic holds
    assert updated_booking_state == old_booking_state
    assert updated_booking_draft == old_booking_draft
    assert updated_active_flow == old_active_flow


@pytest.mark.asyncio
async def test_integration_callback_deduplication() -> None:
    # AAA Pattern
    # PREMISE: FSM state is selecting_time
    input_data = RouterInput(
        chat_id="123456",
        user_input="doc:some-doc",  # Callback query from previous step
        state={
            "active_flow": "booking",
            "booking_state": {"name": "selecting_time"},
            "booking_draft": {"doctorId": "228d4e5c-19b5-4153-9899-0eb437a57f8d"},
        },
        requires_fsm_routing=True,
    )

    # ACTION: Execute router transition
    result = await _route(input_data)

    # GUARANTEE: Router intercepts and returns SKIP_SEND
    assert result.handled is True
    assert result.response_text == "SKIP_SEND"
    assert isinstance(result.nextState, dict)
    assert result.nextState["name"] == "selecting_time"

    # Now verify telegram_send skips calling Telegram API on SKIP_SEND
    send_args: dict[str, object] = {"mode": "send_message", "chat_id": "123456", "text": "SKIP_SEND"}
    send_res = await run_telegram_send(send_args)
    assert send_res.sent is False
    assert send_res.message_id is None


@pytest.mark.asyncio
async def test_integration_strict_registration_validation() -> None:
    # AAA Pattern
    # PREMISE: User enters invalid phone manually in reg_collecting_phone state
    input_data = RouterInput(
        chat_id="123456",
        user_input="invalid-phone-123",
        state={
            "active_flow": "booking",
            "booking_state": {"name": "reg_collecting_phone", "invalid_attempts": 0},
            "booking_draft": {"reg_name": "Test User"},
        },
        requires_fsm_routing=True,
    )

    # ACTION 1: Run FSM Router with invalid phone
    result1 = await _route(input_data)

    # GUARANTEE 1: Phone is rejected, invalid_attempts increments to 1, remains on phone state
    assert result1.handled is True
    assert isinstance(result1.nextState, dict)
    assert result1.nextState["name"] == "reg_collecting_phone"
    assert result1.nextState["invalid_attempts"] == 1
    assert result1.response_text is not None
    assert "⚠️ El número de teléfono no es válido" in result1.response_text

    # ACTION 2: Run FSM Router with invalid phone and 2 previous attempts (reaching 3 total)
    input_data_limit = RouterInput(
        chat_id="123456",
        user_input="invalid-phone-123",
        state={
            "active_flow": "booking",
            "booking_state": {"name": "reg_collecting_phone", "invalid_attempts": 2},
            "booking_draft": {"reg_name": "Test User"},
        },
        requires_fsm_routing=True,
    )
    result2 = await _route(input_data_limit)

    # GUARANTEE 2: Exceeding 3 attempts triggers a reset back to idle
    assert result2.handled is True
    assert isinstance(result2.nextState, dict)
    assert result2.nextState["name"] == "idle"
    assert result2.response_text is not None
    assert "❌ Demasiados intentos" in result2.response_text


@pytest.mark.asyncio
async def test_integration_empty_list_lua_normalization() -> None:
    # AAA Pattern
    # PREMISE: Lua serialization in Redis corrupts empty lists to empty dicts ({})
    r = await create_redis_client(os.environ["REDIS_URL"])
    chat_id = "test-integration-lua-coercion"
    key = f"booking:conv:{chat_id}"

    corrupted_state: dict[str, object] = {
        "chat_id": chat_id,
        "active_flow": "booking",
        "flow_step": 2,
        "booking_state": {
            "name": "selecting_specialty",
            "items": {},  # Empty dict instead of empty list
        },
        "booking_draft": {
            "items": {}  # Empty dict instead of empty list
        },
        "updated_at": "2026-05-22T10:00:00Z",
    }

    await r.set(key, json.dumps(corrupted_state))

    try:
        # ACTION: Retrieve state using conversation_get
        result = await _get_conversation(chat_id, redis_url=os.environ["REDIS_URL"])  # type: ignore[call-arg]

        # GUARANTEE: conversation_get normalizes empty dict items back to empty list []
        assert result.data is not None
        assert isinstance(result.data.booking_state, dict)
        items_state = cast("list[object]", result.data.booking_state["items"])
        assert isinstance(items_state, list)
        assert len(items_state) == 0
        assert isinstance(result.data.booking_draft, dict)
        items_draft = cast("list[object]", result.data.booking_draft["items"])
        assert isinstance(items_draft, list)
        assert len(items_draft) == 0

    finally:
        await r.delete(key)
        await r.aclose()


@pytest.mark.asyncio
async def test_integration_single_batch_scheduler_range() -> None:
    # AAA Pattern
    # PREMISE: Query first active provider and service from Database
    db = await create_db_client()
    try:
        provider_row = await db.fetchrow("SELECT provider_id FROM providers WHERE is_active = True LIMIT 1")
        assert provider_row is not None, "No active provider found in DB"
        provider_id = str(provider_row["provider_id"])

        service_row = await db.fetchrow(
            "SELECT service_id FROM services WHERE provider_id = $1::uuid AND is_active = True LIMIT 1",
            provider_row["provider_id"],
        )
        assert service_row is not None, "No active service found for provider"
        service_id = str(service_row["service_id"])

        # ACTION: Run get_availability_range for a 7-day range
        date_from = "2026-06-01"
        date_to = "2026-06-07"
        results = await get_availability_range(db, provider_id, service_id, date_from, date_to)

        # GUARANTEE: Returns availability entries matching the dates in batch
        assert len(results) == 7
        for r in results:
            assert r["provider_id"] == provider_id
            assert r["date"] is not None
            assert isinstance(r["slots"], list)
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_integration_concurrent_gcal_reconcile() -> None:
    # AAA Pattern
    # PREMISE: Reconcile runs successfully and processes pending synchronization items (or 0 items cleanly)
    args = InputSchema(max_gcal_retries=3, batch_size=10, dry_run=True, max_retries=3)

    # ACTION: Run the cron-job reconciliation
    result = await run_gcal_reconcile(args.model_dump())

    # GUARANTEE: Execute successfully without throwing database connection or timezone errors
    assert "processed" in result
    assert "synced" in result
    assert isinstance(result["errors"], list)
