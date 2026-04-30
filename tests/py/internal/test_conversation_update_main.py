import pytest

from f.internal.conversation_update.main import _main_async


@pytest.mark.asyncio
async def test_main_async_none_args_returns_skipped() -> None:
    from typing import cast

    result = await _main_async(None)
    data = cast("dict[str, object]", result["data"])
    assert data["success"] is False
    assert data["skipped"] is True
    assert data["reason"] == "invalid_args_type"
