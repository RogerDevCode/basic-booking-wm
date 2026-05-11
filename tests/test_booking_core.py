from __future__ import annotations

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from f.booking_cancel.main import main_async as cancel_main
from f.booking_create.main import main_async as create_main
from f.booking_reschedule.main import main_async as reschedule_main

# UUIDs
VALID_PROVIDER_ID = "11111111-1111-1111-1111-111111111111"
VALID_CLIENT_ID = "22222222-2222-2222-2222-222222222222"
VALID_SERVICE_ID = "33333333-3333-3333-3333-333333333333"
VALID_BOOKING_ID = "44444444-4444-4444-4444-444444444444"


class TestBookingOperations:
    """Unit tests for Core Booking Operations with full mock objects."""

    @pytest.fixture
    def mock_db(self) -> MagicMock:
        db = AsyncMock()
        db.execute.return_value = "BEGIN"
        db.close.return_value = None
        return db

    @pytest.mark.asyncio
    @patch("f.booking_create.main.create_db_client")
    @patch("f.booking_create.main.with_tenant_context")
    async def test_create_booking_success(
        self, mock_with_tenant: AsyncMock, mock_db_factory: AsyncMock, mock_db: MagicMock
    ) -> None:
        # Arrange
        args: dict[str, Any] = {
            "client_id": VALID_CLIENT_ID,
            "provider_id": VALID_PROVIDER_ID,
            "service_id": VALID_SERVICE_ID,
            "start_time": "2026-05-15T10:00:00Z",
            "idempotency_key": "test-ik-1",
            "actor": "client",
        }
        mock_db_factory.return_value = mock_db
        mock_with_tenant.return_value = {"booking_id": VALID_BOOKING_ID, "status": "confirmed"}

        # Act
        result = await create_main(args)

        # Assert
        assert result is not None
        assert result["booking_id"] == VALID_BOOKING_ID

    @pytest.mark.asyncio
    @patch("f.booking_cancel.main.create_db_client")
    @patch("f.booking_cancel.main.PostgresBookingCancelRepository")
    async def test_cancel_booking_not_found(
        self, mock_repo_class: MagicMock, mock_db_factory: AsyncMock, mock_db: MagicMock
    ) -> None:
        # Arrange
        args: dict[str, Any] = {"booking_id": VALID_BOOKING_ID, "actor": "client", "actor_id": VALID_CLIENT_ID}
        mock_db_factory.return_value = mock_db

        repo_mock = MagicMock()
        repo_mock.fetch_booking = AsyncMock(return_value=None)
        mock_repo_class.return_value = repo_mock

        # Act & Assert
        with pytest.raises(RuntimeError, match="not_found"):
            await cancel_main(args)

    @pytest.mark.asyncio
    @patch("f.booking_reschedule.main.create_db_client")
    @patch("f.booking_reschedule.main.PostgresRescheduleRepository")
    @patch("f.booking_reschedule.main.with_tenant_context")
    async def test_reschedule_overlap_error(
        self, mock_with_tenant: AsyncMock, mock_repo_class: MagicMock, mock_db_factory: AsyncMock, mock_db: MagicMock
    ) -> None:
        # Arrange
        args: dict[str, Any] = {
            "booking_id": VALID_BOOKING_ID,
            "new_start_time": "2026-05-15T11:00:00Z",
            "idempotency_key": "resch-ik-1",
            "actor": "client",
            "actor_id": VALID_CLIENT_ID,
        }
        mock_db_factory.return_value = mock_db

        repo_mock = MagicMock()
        repo_mock.fetch_booking = AsyncMock(
            return_value={
                "booking_id": VALID_BOOKING_ID,
                "provider_id": VALID_PROVIDER_ID,
                "client_id": VALID_CLIENT_ID,
                "status": "confirmed",
                "start_time": datetime(2026, 5, 15, 10, 0),
                "service_id": VALID_SERVICE_ID,
                "idempotency_key": "old-ik",
            }
        )
        repo_mock.fetch_service = AsyncMock(return_value={"service_id": VALID_SERVICE_ID, "duration_minutes": 30})
        mock_repo_class.return_value = repo_mock

        # Mock transaction failure for overlap
        mock_with_tenant.side_effect = RuntimeError("overlap")

        # Act & Assert
        with pytest.raises(RuntimeError):
            await reschedule_main(args)
