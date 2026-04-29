from typing import Any
from typing import cast, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.patient_register.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_patient_register_success() -> None:
    mock_db = AsyncMock()
    # 1. Search for existing -> []
    # 2. Insert -> returning row
    mock_db.fetch.side_effect = [
        [],  # telegram lookup
        [],  # email lookup
        [
            {  # insert result
                "client_id": VALID_ID,
                "name": "Test Client",
                "email": "t@t.com",
                "phone": None,
                "telegram_chat_id": "123",
                "timezone": "UTC",
            }
        ],
    ]

    async def mock_with_tenant(db: object, tid: str, op: Any) -> object:
        return await op()

    with (
        patch("f.patient_register.main.create_db_client", return_value=mock_db),
        patch("f.patient_register.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {"name": "Test Client", "email": "t@t.com", "telegram_chat_id": "123", "provider_id": VALID_ID}

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["client_id"] == VALID_ID
        assert result["created"] is True
