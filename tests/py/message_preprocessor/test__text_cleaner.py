from __future__ import annotations

from f.message_preprocessor._text_cleaner import clean_text


def test_clean_text_strips_leading_trailing_whitespace() -> None:
    assert clean_text("  hola  ") == "hola"


def test_clean_text_collapses_multiple_spaces() -> None:
    assert clean_text("hola   mundo") == "hola mundo"


def test_clean_text_collapses_tabs() -> None:
    assert clean_text("hola\tmundo") == "hola mundo"


def test_clean_text_collapses_newlines() -> None:
    assert clean_text("hola\nmundo\n") == "hola mundo"


def test_clean_text_removes_null_byte() -> None:
    assert "\x00" not in clean_text("hola\x00mundo")


def test_clean_text_removes_zero_width_space() -> None:
    # U+200B: category Cf
    assert "​" not in clean_text("ho​la")


def test_clean_text_removes_zero_width_joiner() -> None:
    # U+200D: category Cf
    assert "‍" not in clean_text("hola‍mundo")


def test_clean_text_removes_rtl_override() -> None:
    # U+202E: category Cf
    assert "‮" not in clean_text("hola‮mundo")


def test_clean_text_removes_bom() -> None:
    # U+FEFF: category Cf (BOM / zero-width no-break space)
    result = clean_text("﻿hola")
    assert "﻿" not in result
    assert "hola" in result


def test_clean_text_preserves_accented_chars() -> None:
    assert clean_text("médico") == "médico"


def test_clean_text_preserves_enie() -> None:
    assert clean_text("mañana") == "mañana"


def test_clean_text_preserves_question_marks() -> None:
    assert "¿" in clean_text("¿cómo estás?")


def test_clean_text_empty_string() -> None:
    assert clean_text("") == ""


def test_clean_text_only_spaces() -> None:
    assert clean_text("     ") == ""


def test_clean_text_only_tabs() -> None:
    assert clean_text("\t\t\t") == ""


def test_clean_text_single_char() -> None:
    assert clean_text("a") == "a"


def test_clean_text_idempotent() -> None:
    text = "hola mundo"
    assert clean_text(clean_text(text)) == clean_text(text)


def test_clean_text_very_long_string_no_double_spaces() -> None:
    long = "palabra " * 1000
    result = clean_text(long)
    assert "  " not in result


def test_clean_text_emoji_preserved() -> None:
    # Emoji are in category So/Cs — not Cc/Cf — should be preserved
    result = clean_text("hola 😀")
    assert "😀" in result
