from typing import Any
from typing import cast, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.web_provider_notes.main import main

VALID_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"


@pytest.mark.asyncio
async def test_provider_notes_create_success() -> None:
    mock_db = AsyncMock()
    # 1. create insert -> returning row
    # 2. get_tags -> []
    mock_db.fetch.side_effect = [
        [
            {
                "note_id": "n1",
                "provider_id": VALID_ID,
                "booking_id": "b1",
                "client_id": "c1",
                "content_encrypted": "hex-data",
                "encryption_version": 1,
                "created_at": "2026-05-01T10:00:00Z",
                "updated_at": "2026-05-01T10:00:00Z",
            }
        ],
        [],  # get_tags
    ]

    async def mock_with_tenant(db: object, tid: str, op: Any) -> object:
        return await op()

    with (
        patch("f.web_provider_notes.main.create_db_client", return_value=mock_db),
        patch("f.web_provider_notes.main.with_tenant_context", side_effect=mock_with_tenant),
        patch("f.web_provider_notes._notes_logic.encrypt_data", return_value="hex-data"),
        patch("f.web_provider_notes._notes_logic.decrypt_data", return_value="Test Content"),
    ):
        args: dict[str, Any] = {
            "action": "create",
            "provider_id": VALID_ID,
            "booking_id": VALID_ID,
            "client_id": VALID_ID,
            "content": "Test Content",
            "tag_ids": ["t1"],
        }
        err, result = main(args)

        assert err is None
        assert result is not None
        assert result["note_id"] == "n1"
        assert result["content"] == "Test Content"
        assert mock_db.execute.called  # assign_tags
