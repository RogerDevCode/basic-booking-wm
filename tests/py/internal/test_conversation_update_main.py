import pytest

from f.internal.conversation_update.main import _main_async


@pytest.mark.asyncio
async def test_main_async_none_args_returns_skipped() -> None:
    with pytest.raises(RuntimeError, match="args is not a dict"):
        await _main_async(None)
