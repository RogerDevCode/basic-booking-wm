import pytest

import f.telegram_send.main


# This is an auto-generated test boilerplate for f.telegram_send.main
@pytest.mark.asyncio
async def test_main_basic_import() -> None:
    # Ensure the module is importable and has basic structure
    assert f.telegram_send.main is not None


def test_normalize_text_tuple_to_string() -> None:
    result = f.telegram_send.main._normalize_text(("hola", "mundo"))
    assert result == "hola mundo"
