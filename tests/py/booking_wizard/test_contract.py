from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.booking_wizard.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_booking_wizard_start() -> None:
    mock_db = AsyncMock()
    # Mock resolve_tenant (none needed for start usually, but let's mock it)

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.booking_wizard.main.create_db_client", return_value=mock_db),
        patch("f.booking_wizard.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {
            "action": "start",
            "provider_id": VALID_ID,
            "wizard_state": {"client_id": "c1", "chat_id": "123"},
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        message = str(result["message"])
        assert "Elige una fecha" in message
        wizard_state = cast("dict[str, object]", result["wizard_state"])
        assert wizard_state["step"] == 1


@pytest.mark.asyncio
async def test_booking_wizard_select_date_success() -> None:
    mock_db = AsyncMock()
    # 1. get_service_duration
    # 2. get_available_slots
    mock_db.fetch.side_effect = [
        [{"duration_minutes": 30}],  # service duration
        [{"start_time": "2026-05-01T09:00:00Z"}],  # already booked
    ]

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.booking_wizard.main.create_db_client", return_value=mock_db),
        patch("f.booking_wizard.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {
            "action": "select_date",
            "user_input": "2026-05-01",
            "provider_id": VALID_ID,
            "service_id": VALID_ID,
            "wizard_state": {"client_id": "c1", "chat_id": "123", "step": 1},
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        message = str(result["message"])
        assert "Elige un horario" in message
        wizard_state = cast("dict[str, object]", result["wizard_state"])
        assert wizard_state["selected_date"] == "2026-05-01"
        wizard_state = cast("dict[str, object]", result["wizard_state"])
        assert wizard_state["step"] == 2
