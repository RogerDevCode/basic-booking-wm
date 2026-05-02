from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# Mock wmill before any imports
sys_modules = {"wmill": MagicMock()}
with patch.dict("sys.modules", sys_modules):
    # Now import the logic to test
    from f.booking_orchestrator.main import _main_async

@pytest.mark.asyncio
async def test_telegram_orchestrator_ambiguous_intent_graceful_exit() -> None:
    """TC-REG-003: Verify graceful exit on ambiguous intent."""
    # Arrange
    args: dict[str, Any] = {
        "intent": "duda_general",
        "message": "¿Qué tiempo hace?"
    }
    
    # Act
    err, result = await _main_async(args)
    
    # Assert
    assert err is None
    assert result is None

@pytest.mark.asyncio
async def test_telegram_orchestrator_create_booking_fails_without_db() -> None:
    """TC-REG-001: Verify creation flow (fails without real DB)."""
    # Arrange
    args: dict[str, Any] = {
        "intent": "crear_cita",
        "message": "Quiero reservar"
    }
    
    # Act
    err, _result = await _main_async(args)
    
    # Assert
    # Orchestrator tries to resolve context via DB
    assert err is not None
