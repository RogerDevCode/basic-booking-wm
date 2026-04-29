from typing import Any
from typing import cast
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from f.booking_orchestrator.main import _main_async
from f.booking_orchestrator._orchestrator_models import OrchestratorInput, OrchestratorResult


class TestOrchestrator:
    """Unit tests for Booking Orchestrator."""

    @pytest.mark.asyncio
    async def test_main_async_invalid_input(self) -> None:
        # Arrange
        args: dict[str, Any] = {"intent": "invalid_intent"}
        # Act
        err, result = await _main_async(args)
        # Assert
        assert err is not None
        assert "Invalid input" in str(err)

    @pytest.mark.asyncio
    async def test_normalize_intent(self) -> None:
        from f.booking_orchestrator._intent_router import normalize_intent

        # Act & Assert
        assert normalize_intent("reagendar") == "reagendar_cita"
        assert normalize_intent("ver_mis_citas") == "mis_citas"
        assert normalize_intent("unknown") is None

    @pytest.mark.asyncio
    @patch("f.booking_orchestrator.main.create_db_client")
    @patch("f.booking_orchestrator.main.resolve_context")
    @patch("f.booking_orchestrator.main.HANDLER_MAP")
    async def test_main_async_success(
        self, mock_handler_map: MagicMock, mock_resolve: AsyncMock, mock_db: AsyncMock
    ) -> None:
        # Arrange
        args: dict[str, Any] = {"telegram_chat_id": "123", "intent": "mis_citas", "entities": {}}

        mock_resolve.return_value = (
            None,
            {
                "tenantId": "t1",
                "clientId": "c1",
                "providerId": "p1",
                "serviceId": "s1",
                "date": "2026-05-15",
                "time": "10:00",
            },
        )

        handler_mock = AsyncMock()
        handler_mock.return_value = (None, {"action": "mis_citas", "success": True, "message": "OK"})
        mock_handler_map.__getitem__.return_value = handler_mock

        # Act
        err, result = await _main_async(args)

        # Assert
        assert err is None
        assert result is not None
        assert result["action"] == "mis_citas"
        assert result["success"] is True
