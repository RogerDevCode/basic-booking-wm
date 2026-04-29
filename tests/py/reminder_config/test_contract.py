from typing import Any
from typing import cast, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.reminder_config.main import main


@pytest.mark.asyncio
async def test_reminder_config_show() -> None:
    mock_db = AsyncMock()
    # Mock load_preferences (metadata lookup)
    mock_db.fetch.return_value = [{"metadata": {"reminder_preferences": {"telegram_24h": True}}}]

    async def mock_with_tenant(db: object, tid: str, op: Any) -> object:
        return await op()

    with (
        patch("f.reminder_config.main.create_db_client", return_value=mock_db),
        patch("f.reminder_config.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {"action": "show", "client_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
        err, result = await main(args)

        assert err is None
        assert result is not None
        assert "Configuración" in result["message"]
        assert result["preferences"]["telegram_24h"] is True
