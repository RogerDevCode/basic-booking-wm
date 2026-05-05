from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from f.booking_orchestrator._orchestrator_models import OrchestratorInput
from f.booking_orchestrator.handlers._create import handle_create_booking


def _make_input(**kwargs: object) -> OrchestratorInput:
    base: dict[str, object] = {
        "intent": "crear_cita",
        "tenant_id": "11111111-1111-1111-1111-111111111111",
        "client_id": "22222222-2222-2222-2222-222222222222",
    }
    base.update(kwargs)
    return OrchestratorInput.model_validate(base)


@pytest.mark.asyncio
async def test_handle_create_booking_missing_fields_returns_specialty_wizard() -> None:
    conn = AsyncMock()
    conn.fetch = AsyncMock(
        return_value=[
            {"id": "spec-1", "name": "Cardiología", "provider_count": 2},
            {"id": "spec-2", "name": "Dermatología", "provider_count": 0},
        ]
    )
    input_data = _make_input()

    err, result = await handle_create_booking(conn, input_data)

    assert err is None
    assert result is not None
    assert result["action"] == "crear_cita"
    assert result["success"] is False
    next_state = result.get("nextState")
    assert isinstance(next_state, dict)
    assert next_state["name"] == "selecting_specialty"
    assert result.get("inline_buttons") is not None


@pytest.mark.asyncio
async def test_handle_create_booking_specialty_with_no_providers_excluded_from_buttons() -> None:
    conn = AsyncMock()
    conn.fetch = AsyncMock(
        return_value=[
            {"id": "spec-1", "name": "Cardiología", "provider_count": 2},
            {"id": "spec-2", "name": "Dermatología", "provider_count": 0},
        ]
    )
    input_data = _make_input()

    err, result = await handle_create_booking(conn, input_data)

    assert err is None
    assert result is not None
    buttons: list[list[dict[str, str]]] = result.get("inline_buttons", [])  # type: ignore[assignment]
    flat = [btn for row in buttons for btn in row]
    button_texts = [b["text"] for b in flat]
    assert "Cardiología" in button_texts
    assert "Dermatología" not in button_texts


@pytest.mark.asyncio
async def test_handle_create_booking_all_fields_present_calls_create_module() -> None:
    conn = AsyncMock()
    input_data = _make_input(provider_id="prov-1", service_id="svc-1", date="2026-05-10", time="09:00")

    with (
        patch(
            "f.booking_orchestrator.handlers._create.get_active_booking_for_provider",
            AsyncMock(return_value=(None, None)),
        ),
        patch(
            "f.booking_orchestrator.handlers._create.create_booking",
            AsyncMock(return_value=(None, {"booking_id": "bk-1", "status": "confirmed"})),
        ),
    ):
        err, result = await handle_create_booking(conn, input_data)

        assert err is None
        assert result is not None
        assert result["action"] == "crear_cita"
        assert result["success"] is True
        assert "✅" in result["message"]


@pytest.mark.asyncio
async def test_handle_create_booking_create_failure_sets_success_false() -> None:
    conn = AsyncMock()
    input_data = _make_input(provider_id="prov-1", service_id="svc-1", date="2026-05-10", time="09:00")

    with (
        patch(
            "f.booking_orchestrator.handlers._create.get_active_booking_for_provider",
            AsyncMock(return_value=(None, None)),
        ),
        patch(
            "f.booking_orchestrator.handlers._create.create_booking",
            AsyncMock(return_value=(Exception("Slot already taken"), None)),
        ),
    ):
        err, result = await handle_create_booking(conn, input_data)

        assert err is None
        assert result is not None
        assert result["success"] is False
        assert "❌" in result["message"]
