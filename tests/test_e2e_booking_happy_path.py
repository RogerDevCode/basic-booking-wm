from __future__ import annotations

import sys
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure wmill is mocked before imports
if "wmill" not in sys.modules:
    sys.modules["wmill"] = MagicMock()

from f.booking_orchestrator.main import _main_async as orchestrator_main

# Constants for testing
VALID_CLIENT_ID = "c1111111-1111-1111-1111-111111111111"
VALID_PROVIDER_ID = "p2222222-2222-2222-2222-222222222222"
VALID_SERVICE_ID = "s3333333-3333-3333-3333-333333333333"
VALID_TENANT_ID = "t4444444-4444-4444-4444-444444444444"
VALID_BOOKING_ID = "b5555555-5555-5555-5555-555555555555"


@pytest.fixture
def mock_resolve_context() -> tuple[None, dict[str, str]]:
    return (
        None,
        {
            "tenantId": VALID_TENANT_ID,
            "clientId": VALID_CLIENT_ID,
            "providerId": VALID_PROVIDER_ID,
            "serviceId": VALID_SERVICE_ID,
            "date": "2026-06-01",
            "time": "10:00",
        },
    )


@pytest.fixture
def mock_booking_repo() -> MagicMock:
    repo = MagicMock()
    repo.get_client_context = AsyncMock(return_value={"id": VALID_CLIENT_ID, "name": "Ana Test"})
    repo.get_provider_context = AsyncMock(return_value={"id": VALID_PROVIDER_ID, "name": "Dr. Test"})
    repo.get_service_context = AsyncMock(return_value={"id": VALID_SERVICE_ID, "name": "Consulta", "duration": 30})
    repo.is_provider_blocked = AsyncMock(return_value=False)
    repo.is_provider_scheduled = AsyncMock(return_value=True)
    repo.has_overlapping_booking = AsyncMock(return_value=False)
    repo.has_active_booking_for_client = AsyncMock(return_value=False)
    repo.has_client_overlap = AsyncMock(return_value=False)

    booking_result: dict[str, object] = {
        "booking_id": VALID_BOOKING_ID,
        "provider_name": "Dr. Test",
        "service_name": "Consulta",
        "start_time": "2026-06-01T10:00:00",
        "end_time": "2026-06-01T10:30:00",
        "status": "confirmed",
        "client_name": "Ana Test",
    }
    repo.insert_booking = AsyncMock(return_value=booking_result)
    return repo


@pytest.mark.asyncio
async def test_e2e_booking_happy_path(
    mock_resolve_context: tuple[None, dict[str, str]], mock_booking_repo: MagicMock
) -> None:
    """
    Phase 1: Happy Path test suite for the 'booking creation flow'
    Simulates the end-to-end flow from receiving intent to a successfully confirmed booking.

    NOTE: With @workflow + task_script architecture, cross-script calls go through Windmill's
    scheduler. In tests, we inject book_create as a delegate that returns the expected result
    directly — this is the correct isolation boundary.
    """
    # 1. Mock Orchestrator Dependencies
    mock_db = AsyncMock()
    mock_db.close.return_value = None

    # 2. Expected result from booking_create — the delegate returns this directly
    booking_created: dict[str, object] = {
        "booking_id": VALID_BOOKING_ID,
        "provider_name": "Dr. Test",
        "service_name": "Consulta",
        "start_time": "2026-06-01T10:00:00",
        "end_time": "2026-06-01T10:30:00",
        "status": "confirmed",
        "client_name": "Ana Test",
    }

    # 3. Inject book_create as a delegate (correct isolation per @workflow architecture)
    book_create_mock = AsyncMock(return_value=booking_created)

    delegates = {
        "book_create": book_create_mock,
        "book_cancel": AsyncMock(return_value={}),
        "book_reschedule": AsyncMock(return_value={}),
        "availability_check": AsyncMock(return_value={}),
    }

    with (
        patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
        patch("f.booking_orchestrator.main.resolve_context", return_value=mock_resolve_context),
        patch(
            "f.booking_orchestrator.handlers._create.get_active_booking_for_provider",
            AsyncMock(return_value=(None, None)),
        ),
    ):
        # 4. Simulate Orchestrator Input (mimicking Webhook -> Router -> Orchestrator)
        args: dict[str, object] = {
            "telegram_chat_id": "987654321",
            "intent": "crear_cita",
            "channel": "telegram",
            "entities": {
                "provider_id": VALID_PROVIDER_ID,
                "service_id": VALID_SERVICE_ID,
                "date": "2026-06-01",
                "time": "10:00",
            },
        }

        # 5. Execute the Flow with injected delegates
        err, result = await orchestrator_main(args, delegates)

        # 6. Assert Correct State Changes & Flow
        assert err is None, f"Expected no error, got {err}"
        assert result is not None, "Expected a valid result"

        # Check that it advanced correctly through the orchestrator
        assert result["action"] == "crear_cita"
        assert result["success"] is True

        # Check that it successfully created the booking
        data = result.get("data")
        assert data is not None
        data_dict = cast("dict[str, object]", data)
        assert data_dict["booking_id"] == VALID_BOOKING_ID
        assert data_dict["status"] == "confirmed"
        assert data_dict["provider_name"] == "Dr. Test"

        # Verify that the delegate was called correctly
        book_create_mock.assert_awaited_once()
        call_kwargs = book_create_mock.call_args.kwargs
        assert call_kwargs.get("args", {}).get("client_id") == VALID_CLIENT_ID
        assert call_kwargs.get("args", {}).get("provider_id") == VALID_PROVIDER_ID
