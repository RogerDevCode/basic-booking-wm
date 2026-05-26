from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from f.telegram_gateway.app import app
from f.telegram_gateway.worker import process_telegram_update


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    # Direct returns
    redis.set.return_value = True
    redis.delete.return_value = True
    redis.incr.return_value = 1
    redis.lpush.return_value = 1
    redis.ltrim.return_value = True
    redis.get.return_value = None
    redis.lrange.return_value = []
    return redis


@pytest.fixture
def mock_arq() -> AsyncMock:
    arq = AsyncMock()
    arq.enqueue_job.return_value = MagicMock()
    return arq


@pytest.fixture
def test_client(mock_redis: AsyncMock, mock_arq: AsyncMock) -> TestClient:
    app.state.redis = mock_redis
    app.state.arq_pool = mock_arq
    return TestClient(app)


def test_webhook_valid_update_enqueues_and_returns_200(
    test_client: TestClient,
    mock_redis: AsyncMock,
    mock_arq: AsyncMock,
) -> None:
    # Arrange
    payload = {
        "update_id": 12345,
        "message": {
            "message_id": 1,
            "chat": {"id": 99999, "type": "private"},
            "date": 1600000000,
            "text": "hola",
            "from": {"id": 88888, "first_name": "Test", "username": "testuser"},
        },
    }

    # Action
    res = test_client.post("/webhook/telegram", json=payload)

    # Assert
    assert res.status_code == status.HTTP_200_OK
    assert res.json() == {"status": "enqueued", "update_id": 12345}
    mock_redis.set.assert_called_once_with("idemp:12345", "1", nx=True, ex=3600)
    mock_arq.enqueue_job.assert_called_once()


def test_webhook_duplicate_update_is_ignored(
    test_client: TestClient,
    mock_redis: AsyncMock,
    mock_arq: AsyncMock,
) -> None:
    # Arrange
    mock_redis.set.return_value = False  # Simulate duplicate key already set
    payload = {
        "update_id": 12345,
        "message": {
            "message_id": 1,
            "chat": {"id": 99999, "type": "private"},
            "date": 1600000000,
            "text": "hola",
        },
    }

    # Action
    res = test_client.post("/webhook/telegram", json=payload)

    # Assert
    assert res.status_code == status.HTTP_200_OK
    assert res.json() == {"status": "duplicate_ignored", "update_id": 12345}
    mock_redis.set.assert_called_once_with("idemp:12345", "1", nx=True, ex=3600)
    mock_arq.enqueue_job.assert_not_called()


@pytest.mark.asyncio
async def test_worker_process_update_acquires_and_releases_lock(
    mock_redis: AsyncMock,
) -> None:
    # Arrange
    payload = {
        "update_id": 12345,
        "message": {
            "message_id": 1,
            "chat": {"id": 99999, "type": "private"},
            "date": 1600000000,
            "text": "hola",
            "from": {"id": 88888, "first_name": "Test", "username": "testuser"},
        },
    }
    update_json = json.dumps(payload)

    metrics = AsyncMock()
    ctx = {"redis": mock_redis, "metrics": metrics}

    # Mock all internal pipeline services to avoid DB/Network access
    with (
        patch("f.telegram_gateway.worker.create_db_client", new_callable=AsyncMock),
        patch("f.telegram_gateway.worker._get_conversation", new_callable=AsyncMock) as mock_get_conv,
        patch("f.telegram_gateway.worker.run_telegram_auto_register", new_callable=AsyncMock) as mock_reg,
        patch("f.telegram_gateway.worker.run_ai_agent", new_callable=AsyncMock) as mock_ai,
        patch("f.telegram_gateway.worker.run_fsm_router", new_callable=AsyncMock) as mock_fsm,
        patch("f.telegram_gateway.worker.run_conversational_router", new_callable=AsyncMock) as mock_conv,
        patch("f.telegram_gateway.worker.run_conversation_update", new_callable=AsyncMock) as mock_upd,
        patch("f.telegram_gateway.worker.run_telegram_send", new_callable=AsyncMock) as mock_send,
    ):
        mock_reg.return_value = {"client_id": "client-uuid", "phone": "569123456", "name": "Test"}
        mock_get_conv.return_value.data = MagicMock(
            active_flow="none", flow_step=0, version=1, booking_state={"name": "idle"}
        )
        mock_ai.return_value = {"success": True, "data": {"intent": "crear_cita", "requires_fsm_routing": True}}
        mock_fsm.return_value = {
            "data": {
                "handled": True,
                "response_text": "FSM response",
                "nextState": {"name": "selecting_time"},
            }
        }
        mock_conv.return_value = {"data": {"handled": False}}
        mock_upd.return_value = {"success": True}

        # Action
        await process_telegram_update(ctx, update_json)

        # Assert
        # Check lock acquisition
        mock_redis.set.assert_any_call("lock:user:99999", "1", nx=True, ex=10)
        # Check lock release
        mock_redis.delete.assert_called_with("lock:user:99999")
        # Check pipeline progression
        mock_get_conv.assert_called_once()
        mock_reg.assert_called_once()
        mock_fsm.assert_called_once()
        mock_send.assert_called_once()


def test_metrics_endpoint_returns_data(
    test_client: TestClient,
    mock_redis: AsyncMock,
) -> None:
    # Arrange
    mock_redis.get.side_effect = {
        "metrics:requests_total": "42",
        "metrics:errors_total": "2",
    }.get
    mock_redis.lrange.return_value = ["150.0", "250.0"]

    # Action
    res = test_client.get("/monitoring/metrics")

    # Assert
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["requests_total"] == 42
    assert data["errors_total"] == 2
    assert data["avg_total_time_ms"] == 200.0
    assert data["samples_count"] == 2
