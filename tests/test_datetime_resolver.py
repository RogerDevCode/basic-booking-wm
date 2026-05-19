from __future__ import annotations

from f.nlu._datetime_resolver import normalize_text, resolve_datetime


def test_normalization() -> None:
    assert normalize_text("Miérkóles!!!") == "mierkoles"
    assert normalize_text("@@@ mierk...oles ###") == "mierkoles"


def test_exact_match() -> None:
    res = resolve_datetime("hoy")
    assert res.intent_detected is True
    assert res.day == "today"
    assert res.source == "exact"
    assert res.confidence == 1.0


def test_fuzzy_match() -> None:
    res = resolve_datetime("mierkoles")
    assert res.intent_detected is True
    assert res.day == "miercoles"
    assert res.source in ("fuzzy", "phonetic")
    assert res.confidence >= 0.85


def test_phonetic_match() -> None:
    res = resolve_datetime("miercoless")
    assert res.intent_detected is True
    assert res.day == "miercoles"


def test_adversarial() -> None:
    res = resolve_datetime("miercoles DROP TABLE")
    assert res.intent_detected is True
    assert res.day == "miercoles"


def test_false_cognate() -> None:
    res = resolve_datetime("marzo")
    # Should not match "martes"
    assert res.day is None


def test_multi_word() -> None:
    res = resolve_datetime("pasado mañana")
    assert res.intent_detected is True
    assert res.day == "day+2"
