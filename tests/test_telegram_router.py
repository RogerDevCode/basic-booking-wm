from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.internal.telegram_router.main import _main_async as main


class TestTelegramRouter:
    """Unit tests for Telegram Router."""

    @pytest.mark.asyncio
    async def test_router_no_flow_not_handled(self) -> None:
        # Arrange
        args: dict[str, Any] = {"chat_id": "123", "user_input": "Hola", "state": {"active_flow": None}}
        # Act
        res = await main(args)
        assert res is not None
        # Assert
        assert cast("dict[str, Any]", res["data"])["handled"] is False

    @pytest.mark.asyncio
    @patch("f.internal.telegram_router.main.apply_transition")
    async def test_router_active_flow_handled(self, mock_transition: AsyncMock) -> None:
        # Arrange
        args: dict[str, Any] = {
            "chat_id": "123",
            "user_input": "1",
            "state": {
                "active_flow": "booking",
                "booking_state": {"name": "selecting_specialty", "specialtyId": "s1", "specialtyName": "Test"},
                "booking_draft": {},
            },
        }

        # apply_transition returns (Error, Outcome)
        mock_transition.return_value = (
            None,
            {
                "nextState": AsyncMock(model_dump=lambda: {"name": "selecting_doctor"}),
                "responseText": "Selecciona doctor:",
                "advance": True,
            },
        )

        # Act
        res = await main(args)
        assert res is not None

        # Assert
        assert cast("dict[str, Any]", res["data"])["handled"] is True
        assert cast("dict[str, Any]", res["data"])["response_text"] == "Selecciona doctor:"
