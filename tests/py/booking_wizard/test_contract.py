from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, patch

import pytest

from f.booking_wizard.main import _main_async as main
from f.internal._config import DEFAULT_TIMEZONE

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_booking_wizard_start() -> None:
    mock_db = AsyncMock()
    mock_db.fetchrow.return_value = {"tz_name": DEFAULT_TIMEZONE}
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

        result = await main(args)

        assert result is not None
        message = str(result["message"])
        assert "Elige una fecha" in message
        wizard_state = cast("dict[str, object]", result["wizard_state"])
        assert wizard_state["step"] == 1


@pytest.mark.asyncio
async def test_booking_wizard_select_date_success() -> None:
    mock_db = AsyncMock()
    # 1. get_service_duration
    # 2. get_availability is mocked below via patch
    mock_db.fetch.side_effect = [
        [{"duration_minutes": 30}],  # service duration
        [{"service_id": VALID_ID}],  # Fallback query in WizardRepository
    ]

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    mock_avail = {
        "provider_id": VALID_ID,
        "date": "2026-05-01",
        "timezone": "UTC",
        "slots": [{"start": "2026-05-01T09:00:00Z", "end": "2026-05-01T09:30:00Z", "available": True}],
        "total_available": 1,
        "total_booked": 0,
        "is_blocked": False,
        "block_reason": None,
    }

    with (
        patch("f.booking_wizard.main.create_db_client", return_value=mock_db),
        patch("f.booking_wizard.main.with_tenant_context", side_effect=mock_with_tenant),
        patch("f.booking_wizard._wizard_logic.get_availability", return_value=mock_avail),
    ):
        args: dict[str, Any] = {
            "action": "select_date",
            "user_input": "2026-05-01",
            "provider_id": VALID_ID,
            "service_id": VALID_ID,
            "wizard_state": {"client_id": "c1", "chat_id": "123", "step": 1},
        }

        result = await main(args)

        assert result is not None
        message = str(result["message"])
        assert "Elige un horario" in message
        wizard_state = cast("dict[str, object]", result["wizard_state"])
        assert wizard_state["selected_date"] == "2026-05-01"
        wizard_state = cast("dict[str, object]", result["wizard_state"])
        assert wizard_state["step"] == 2
