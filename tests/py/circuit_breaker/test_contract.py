from unittest.mock import AsyncMock, patch

import pytest

from f.circuit_breaker.main import main


@pytest.mark.asyncio
async def test_circuit_breaker_check_closed() -> None:
    mock_db = AsyncMock()
    # 1. init_service
    # 2. get_state -> returns closed state
    mock_db.fetch.return_value = [
        {
            "service_id": "test",
            "state": "closed",
            "failure_count": 0,
            "success_count": 0,
            "failure_threshold": 3,
            "success_threshold": 2,
            "timeout_seconds": 60,
            "opened_at": None,
            "half_open_at": None,
            "last_failure_at": None,
            "last_success_at": None,
            "last_error_message": None,
        }
    ]

    with patch("f.circuit_breaker.main.create_db_client", return_value=mock_db):
        args = {"action": "check", "service_id": "test"}
        err, result = await main(args)

        assert err is None
        assert result["allowed"] is True
        assert result["state"] == "closed"


@pytest.mark.asyncio
async def test_circuit_breaker_record_failure_opens() -> None:
    mock_db = AsyncMock()
    # After record_failure, it fetches state again to check threshold
    mock_db.fetch.return_value = [
        {
            "service_id": "test",
            "state": "closed",
            "failure_count": 3,  # Threshold reached
            "success_count": 0,
            "failure_threshold": 3,
            "success_threshold": 2,
            "timeout_seconds": 60,
            "opened_at": None,
            "half_open_at": None,
            "last_failure_at": "2026-05-01T10:00:00Z",
            "last_success_at": None,
            "last_error_message": "Error",
        }
    ]

    with patch("f.circuit_breaker.main.create_db_client", return_value=mock_db):
        args = {"action": "record_failure", "service_id": "test", "error_message": "Fail"}
        err, result = await main(args)

        assert err is None
        assert result["state"] == "opened"
        # Verify update to 'open' state was called
        calls = [c[0][0] for c in mock_db.execute.call_args_list]
        assert any("SET state = 'open'" in q for q in calls)
