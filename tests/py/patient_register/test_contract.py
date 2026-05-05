from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.patient_register.main import main_async

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine

VALID_ID = "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_patient_register_e2e_mocked() -> None:
    mock_db = AsyncMock()

    # Logic Mock: Search -> Empty, Insert -> Success
    # Skipping telegram lookup because not in args
    # It will try Email, skip Phone (not in input_data), then Insert
    mock_db.fetch.side_effect = [
        [],  # Email lookup
        [
            {  # Insert Result
                "client_id": VALID_ID,
                "name": "Jane Doe",
                "email": "jane@example.com",
                "phone": "5551234",
                "telegram_chat_id": None,
                "timezone": "America/Santiago",
            }
        ],
    ]

    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.patient_register.main.create_db_client", return_value=mock_db),
        patch("f.patient_register.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "provider_id": VALID_ID,
        }

        err, result = await main_async(args)

        assert err is None
        assert result is not None
        assert result["client_id"] == VALID_ID
        assert result["created"] is True


@pytest.mark.asyncio
async def test_patient_register_missing_tenant() -> None:
    args: dict[str, Any] = {
        "name": "Jane Doe",
        "email": "jane@example.com",
    }

    err, result = await main_async(args)

    assert err is not None
    assert "tenant_id required" in str(err)
    assert result is None
