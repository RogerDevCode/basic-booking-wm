from __future__ import annotations

import pytest
from pydantic import ValidationError

from f.message_preprocessor.main import main

# ── Empty / minimal ──────────────────────────────────────────────────────────


def test_chaos_empty_string_valid_output() -> None:
    result = main({"raw_text": ""})
    assert result["raw_text"] == ""
    assert result["cleaned_text"] == ""
    assert result["normalization_applied"] is False
    assert result["confidence"] == 1.0


def test_chaos_only_spaces() -> None:
    result = main({"raw_text": "     "})
    assert result["cleaned_text"] == ""


def test_chaos_single_char() -> None:
    result = main({"raw_text": "a"})
    assert isinstance(result["cleaned_text"], str)
    assert result["confidence"] == 1.0


def test_chaos_single_known_word() -> None:
    result = main({"raw_text": "hola"})
    assert result["cleaned_text"] == "hola"


# ── Scale ─────────────────────────────────────────────────────────────────────


def test_chaos_very_long_message() -> None:
    long = "quiero hora " * 500  # ~6 000 chars
    result = main({"raw_text": long})
    assert isinstance(result["cleaned_text"], str)
    assert len(result["cleaned_text"]) > 0
    assert "  " not in result["cleaned_text"]


def test_chaos_many_fillers() -> None:
    result = main({"raw_text": "po po po po po"})
    assert result["cleaned_text"] == ""


def test_chaos_all_caps() -> None:
    result = main({"raw_text": "QUIERO UNA CITA MEDICA"})
    assert isinstance(result["cleaned_text"], str)
    assert len(result["cleaned_text"]) > 0


# ── Encoding / invisible chars ────────────────────────────────────────────────


def test_chaos_null_byte_removed() -> None:
    result = main({"raw_text": "hola\x00mundo"})
    assert "\x00" not in result["cleaned_text"]


def test_chaos_rtl_override_removed() -> None:
    result = main({"raw_text": "hola‮mundo"})
    assert "‮" not in result["cleaned_text"]


def test_chaos_zero_width_space_removed() -> None:
    result = main({"raw_text": "ho​la"})
    assert "​" not in result["cleaned_text"]


def test_chaos_zero_width_joiner_removed() -> None:
    result = main({"raw_text": "ho‍la"})
    assert "‍" not in result["cleaned_text"]


def test_chaos_bom_removed() -> None:
    result = main({"raw_text": "﻿hola"})
    assert "﻿" not in result["cleaned_text"]


def test_chaos_emoji_preserved() -> None:
    result = main({"raw_text": "hola 😀"})
    assert "😀" in result["cleaned_text"]


# ── Security / injection ──────────────────────────────────────────────────────


def test_chaos_sql_injection_does_not_raise() -> None:
    payload = "'; DROP TABLE bookings; --"
    result = main({"raw_text": payload})
    assert isinstance(result["cleaned_text"], str)


def test_chaos_html_script_injection_does_not_raise() -> None:
    payload = "<script>alert('xss')</script>"
    result = main({"raw_text": payload})
    assert isinstance(result["cleaned_text"], str)


def test_chaos_path_traversal_does_not_raise() -> None:
    payload = "../../../etc/passwd"
    result = main({"raw_text": payload})
    assert isinstance(result["cleaned_text"], str)


def test_chaos_format_string_does_not_raise() -> None:
    payload = "%s %d %n {0} {{raw_text}}"
    result = main({"raw_text": payload})
    assert isinstance(result["cleaned_text"], str)


# ── Output contract ───────────────────────────────────────────────────────────


def test_chaos_output_has_all_required_keys() -> None:
    result = main({"raw_text": "hola"})
    required = {
        "raw_text",
        "cleaned_text",
        "normalization_applied",
        "spell_corrections",
        "modism_matches",
        "confidence",
    }
    assert required.issubset(result.keys())


def test_chaos_confidence_always_between_zero_and_one() -> None:
    inputs = ["", "a", "kiero hora", "x" * 50, "palabra " * 30, "po po po"]
    for text in inputs:
        result = main({"raw_text": text})
        conf = result["confidence"]
        assert isinstance(conf, float)
        assert 0.0 <= conf <= 1.0, f"confidence={conf!r} out of range for input={text!r}"


def test_chaos_raw_text_always_unchanged() -> None:
    inputs = ["kiero hora", "weon po", "manana al tiro", "   ", ""]
    for text in inputs:
        result = main({"raw_text": text})
        assert result["raw_text"] == text, f"raw_text mutated for input={text!r}"


def test_chaos_spell_corrections_is_list() -> None:
    result = main({"raw_text": "cualquier cosa"})
    assert isinstance(result["spell_corrections"], list)


def test_chaos_modism_matches_is_list() -> None:
    result = main({"raw_text": "kiero hora"})
    assert isinstance(result["modism_matches"], list)


def test_chaos_normalization_applied_is_bool() -> None:
    result = main({"raw_text": "hola"})
    assert isinstance(result["normalization_applied"], bool)


# ── Invalid inputs ────────────────────────────────────────────────────────────


def test_chaos_missing_raw_text_key_raises() -> None:
    with pytest.raises(ValidationError):
        main({"wrong_key": "value"})


def test_chaos_none_raw_text_raises() -> None:
    with pytest.raises(ValidationError):
        main({"raw_text": None})


def test_chaos_integer_raw_text_raises() -> None:
    with pytest.raises(ValidationError):
        main({"raw_text": 42})


def test_chaos_empty_dict_raises() -> None:
    with pytest.raises(ValidationError):
        main({})


# ── Idempotency ───────────────────────────────────────────────────────────────


def test_chaos_same_input_same_output() -> None:
    text = "kiero sacar hora pal viernes po"
    r1 = main({"raw_text": text})
    r2 = main({"raw_text": text})
    assert r1["cleaned_text"] == r2["cleaned_text"]
    assert r1["confidence"] == r2["confidence"]


def test_chaos_cleaned_output_idempotent() -> None:
    raw = "kiero hora po"
    r1 = main({"raw_text": raw})
    r2 = main({"raw_text": r1["cleaned_text"]})
    assert r2["normalization_applied"] is False
    assert r2["cleaned_text"] == r1["cleaned_text"]


# ── Mixed content ─────────────────────────────────────────────────────────────


def test_chaos_numbers_only() -> None:
    result = main({"raw_text": "12345678"})
    assert isinstance(result["cleaned_text"], str)
    assert result["normalization_applied"] is False


def test_chaos_mixed_language() -> None:
    result = main({"raw_text": "I want una hora please"})
    assert isinstance(result["cleaned_text"], str)


def test_chaos_repeated_modism() -> None:
    result = main({"raw_text": "kiero kiero kiero una hora"})
    # "kiero" appears multiple times — all should be resolved
    assert "kiero" not in result["cleaned_text"].lower()
