from __future__ import annotations

import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure wmill is mocked before imports
if "wmill" not in sys.modules:
    sys.modules["wmill"] = MagicMock()

from f.booking_create._booking_create_models import BookingCreated
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

    booking_result: BookingCreated = {
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
    """
    # 1. Mock Orchestrator Dependencies
    mock_db = AsyncMock()
    mock_db.close.return_value = None

    async def mock_with_tenant_context(conn, pid, op):
        return await op()

    with (
        patch("f.booking_orchestrator.main.create_db_client", return_value=mock_db),
        patch("f.booking_orchestrator.main.resolve_context", return_value=mock_resolve_context),
        patch(
            "f.booking_orchestrator.handlers._create.get_active_booking_for_provider",
            AsyncMock(return_value=(None, None)),
        ),
        # 2. Mock Booking Engine Dependencies
        patch("f.booking_create.main.create_db_client", return_value=mock_db),
        patch("f.booking_create.main.PostgresBookingCreateRepository", return_value=mock_booking_repo),
        # We bypass the complex with_tenant_context to just execute the block, as we are already isolated in tests
        patch("f.booking_create.main.with_tenant_context", AsyncMock(side_effect=mock_with_tenant_context)),
    ):
        # 3. Simulate Orchestrator Input (mimicking Webhook -> Router -> Orchestrator)
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

        # 4. Execute the Flow
        err, result = await orchestrator_main(args)

        # 5. Assert Correct State Changes & Flow
        assert err is None, f"Expected no error, got {err}"
        assert result is not None, "Expected a valid result"

        # Check that it advanced correctly through the orchestrator
        assert result["action"] == "crear_cita"
        assert result["success"] is True

        # Check that it successfully created the booking
        data = result.get("data")
        assert data is not None
        assert data["booking_id"] == VALID_BOOKING_ID
        assert data["status"] == "confirmed"
        assert data["provider_name"] == "Dr. Test"

        # Verify that booking repository was called correctly
        mock_booking_repo.get_client_context.assert_awaited_once_with(VALID_CLIENT_ID)
        mock_booking_repo.get_provider_context.assert_awaited_once_with(VALID_PROVIDER_ID)
        mock_booking_repo.is_provider_blocked.assert_awaited_once()
        mock_booking_repo.has_overlapping_booking.assert_awaited_once()
        mock_booking_repo.insert_booking.assert_awaited_once()
