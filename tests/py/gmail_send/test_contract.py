from typing import Any
from typing import cast
from unittest.mock import AsyncMock, patch

import pytest

from f.gmail_send.main import main


@pytest.mark.asyncio
async def test_gmail_send_success() -> None:
    # Mock environment variables
    env_vars = {"GMAIL_USER": "test@gmail.com", "GMAIL_PASSWORD": "password123"}

    # Mock send_with_retry to avoid real SMTP
    with (
        patch.dict("os.environ", env_vars),
        patch("f.gmail_send.main.send_with_retry", AsyncMock(return_value=(None, "msg-123"))),
    ):
        args: dict[str, Any] = {
            "recipient_email": "client@example.com",
            "message_type": "booking_created",
            "booking_details": {"provider_name": "Dr. House", "date": "2026-05-01"},
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["sent"] is True
        assert result["message_id"] == "msg-123"


@pytest.mark.asyncio
async def test_gmail_send_invalid_input() -> None:
    args: dict[str, Any] = {"recipient_email": "invalid-email", "message_type": "booking_created"}
    err, result = await main(args)
    assert err is not None
    assert result is None
