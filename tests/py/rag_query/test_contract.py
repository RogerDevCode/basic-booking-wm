from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest

from f.rag_query.main import _main_async as main

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine


@pytest.mark.asyncio
async def test_rag_query_success() -> None:
    mock_db = AsyncMock()

    # 1. fetch_active_entries
    mock_db.fetch.return_value = [
        {
            "kb_id": "1",
            "category": "General",
            "title": "Horarios de Atención",
            "content": "Atendemos de Lunes a Viernes de 9 a 18 hrs.",
        },
        {
            "kb_id": "2",
            "category": "Ubicación",
            "title": "Dirección",
            "content": "Estamos en Av. Providencia 1234, Santiago.",
        },
    ]

    # Mock with_tenant_context
    async def mock_with_tenant(db: object, tid: str, op: Callable[[], Coroutine[Any, Any, object]]) -> object:
        return await op()

    with (
        patch("f.rag_query.main.create_db_client", return_value=mock_db),
        patch("f.rag_query.main.with_tenant_context", side_effect=mock_with_tenant),
    ):
        args: dict[str, Any] = {
            "query": "cuales son los horarios",
            "provider_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "top_k": 5,
        }

        err, result = await main(args)

        assert err is None
        assert result is not None
        assert result["count"] >= 1
        assert "Horarios" in result["entries"][0]["title"]
        assert result["entries"][0]["similarity"] > 0
