from typing import Any
from typing import cast
from unittest.mock import AsyncMock, patch

import pytest

from f.dlq_processor.main import main


@pytest.mark.asyncio
async def test_dlq_list_success() -> None:
    mock_db = AsyncMock()
    mock_db.fetch.return_value = [
        {
            "dlq_id": 1,
            "booking_id": "b1",
            "provider_id": "p1",
            "service_id": "s1",
            "failure_reason": "API Error",
            "last_error_message": "404 Not Found",
            "last_error_stack": None,
            "original_payload": '{"key": "val"}',
            "idempotency_key": "ik1",
            "status": "pending",
            "created_at": "2026-05-01T10:00:00Z",
            "updated_at": "2026-05-01T10:00:00Z",
            "resolved_at": None,
            "resolved_by": None,
            "resolution_notes": None,
        }
    ]

    with patch("f.dlq_processor.main.create_db_client", return_value=mock_db):
        args: dict[str, Any] = {"action": "list", "status_filter": "pending"}
        err, result = await main(args)

        assert err is None
        assert isinstance(result, dict)
        assert result["total"] == 1
        assert result["entries"][0]["failure_reason"] == "API Error"
