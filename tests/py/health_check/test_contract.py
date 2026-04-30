from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from f.health_check.main import _main_async as main


@pytest.mark.asyncio
async def test_health_check_success() -> None:
    # Mock probes
    with (
        patch(
            "f.health_check.main.check_database",
            AsyncMock(return_value={"component": "database", "status": "healthy", "latency_ms": 10, "message": "OK"}),
        ),
        patch(
            "f.health_check.main.check_gcal",
            AsyncMock(return_value={"component": "gcal", "status": "healthy", "latency_ms": 50, "message": "OK"}),
        ),
        patch(
            "f.health_check.main.check_telegram",
            AsyncMock(return_value={"component": "telegram", "status": "healthy", "latency_ms": 30, "message": "OK"}),
        ),
        patch(
            "f.health_check.main.check_gmail",
            return_value={"component": "gmail", "status": "healthy", "latency_ms": 0, "message": "OK"},
        ),
    ):
        args: dict[str, Any] = {"component": "all"}
        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["overall"] == "healthy"
        assert len(result["components"]) == 4


@pytest.mark.asyncio
async def test_health_check_unhealthy() -> None:
    # Mock one component as unhealthy
    with (
        patch(
            "f.health_check.main.check_database",
            AsyncMock(
                return_value={
                    "component": "database",
                    "status": "unhealthy",
                    "latency_ms": 0,
                    "message": "Conn Refused",
                }
            ),
        ),
        patch(
            "f.health_check.main.check_gcal",
            AsyncMock(return_value={"component": "gcal", "status": "healthy", "latency_ms": 10, "message": "OK"}),
        ),
        patch(
            "f.health_check.main.check_telegram",
            AsyncMock(return_value={"component": "telegram", "status": "healthy", "latency_ms": 10, "message": "OK"}),
        ),
        patch(
            "f.health_check.main.check_gmail",
            return_value={"component": "gmail", "status": "healthy", "latency_ms": 0, "message": "OK"},
        ),
    ):
        args: dict[str, Any] = {"component": "all"}
        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["overall"] == "unhealthy"
