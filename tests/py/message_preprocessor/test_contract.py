from __future__ import annotations

from f.message_preprocessor.main import main

# ── Full pipeline AAA contract tests ─────────────────────────────────────────


def test_contract_chilean_booking_request() -> None:
    # Arrange
    raw = "kiero sacar hora pal viernes po"
    # Act
    result = main({"raw_text": raw})
    # Assert
    assert result["raw_text"] == raw
    assert result["normalization_applied"] is True
    phrases = [m["phrase"] for m in result["modism_matches"]]
    assert "kiero" in phrases
    assert "sacar hora" in phrases
    assert "pal" in phrases
    assert "po" in phrases
    assert "kiero" not in result["cleaned_text"].lower()
    assert "po" not in result["cleaned_text"].lower().split()


def test_contract_cancel_with_chilean_slang() -> None:
    raw = "kanselame la hora del lunes"
    result = main({"raw_text": raw})
    assert result["normalization_applied"] is True
    phrases = [m["phrase"] for m in result["modism_matches"]]
    assert "kanselame" in phrases
    assert "cancélame" in result["cleaned_text"]


def test_contract_reschedule_request() -> None:
    raw = "kiero kambiar mi sita pa otra semana"
    result = main({"raw_text": raw})
    assert result["normalization_applied"] is True
    cleaned = result["cleaned_text"].lower()
    assert "cambiar" in cleaned
    assert "cita" in cleaned


def test_contract_ora_mapped_to_hora() -> None:
    raw = "necesito una ora con el médico"
    result = main({"raw_text": raw})
    assert "hora" in result["cleaned_text"]
    assert "ora" not in result["cleaned_text"].lower().split()
    phrases = [m["phrase"] for m in result["modism_matches"]]
    assert "ora" in phrases


def test_contract_manana_normalized() -> None:
    raw = "quiero cita para manana a las 10"
    result = main({"raw_text": raw})
    assert "mañana" in result["cleaned_text"]
    assert "manana" not in result["cleaned_text"]


def test_contract_clean_input_no_change() -> None:
    raw = "necesito cancelar mi cita del viernes"
    result = main({"raw_text": raw})
    assert result["cleaned_text"] == raw
    assert result["normalization_applied"] is False
    assert result["confidence"] == 1.0
    assert result["spell_corrections"] == []
    assert result["modism_matches"] == []


def test_contract_urgent_booking_al_tiro() -> None:
    raw = "kiero una hora al tiro po"
    result = main({"raw_text": raw})
    cleaned = result["cleaned_text"].lower()
    assert "de inmediato" in cleaned
    assert "quiero" in cleaned


def test_contract_output_types() -> None:
    result = main({"raw_text": "kiero hora"})
    assert isinstance(result["raw_text"], str)
    assert isinstance(result["cleaned_text"], str)
    assert isinstance(result["normalization_applied"], bool)
    assert isinstance(result["spell_corrections"], list)
    assert isinstance(result["modism_matches"], list)
    assert isinstance(result["confidence"], float)


def test_contract_spell_correction_structure() -> None:
    result = main({"raw_text": "necesito una consulta urgnte"})
    for c in result["spell_corrections"]:
        assert "original" in c
        assert "corrected" in c
        assert isinstance(c["original"], str)
        assert isinstance(c["corrected"], str)
        assert c["original"] != c["corrected"]


def test_contract_modism_match_structure() -> None:
    result = main({"raw_text": "kiero sacar hora"})
    for m in result["modism_matches"]:
        assert "phrase" in m
        assert "canonical" in m
        assert isinstance(m["phrase"], str)
        assert isinstance(m["canonical"], str)


def test_contract_confidence_decreases_with_more_spell_corrections() -> None:
    clean_result = main({"raw_text": "quiero una cita médica"})
    messy_result = main({"raw_text": "quiero una cita medkia urgnte hospitl"})
    assert messy_result["confidence"] <= clean_result["confidence"]


def test_contract_modisms_do_not_penalise_confidence() -> None:
    # Pure modism input (no spell corrections) should keep confidence = 1.0
    result = main({"raw_text": "kiero sacar hora po"})
    # All words resolved via modism map → no spell corrections
    assert result["spell_corrections"] == []
    assert result["confidence"] == 1.0


def test_contract_weon_po_fillers_cleaned() -> None:
    raw = "weon kiero una hora po"
    result = main({"raw_text": raw})
    cleaned_words = result["cleaned_text"].lower().split()
    assert "weon" not in cleaned_words
    assert "po" not in cleaned_words
    assert result["normalization_applied"] is True


def test_contract_real_world_dyslexia_sample() -> None:
    # Real-world message from a user with reading/writing difficulties
    raw = "oiga kiero sacar ora pal doctor pal lune al tiro si es posible po"
    result = main({"raw_text": raw})
    cleaned = result["cleaned_text"].lower()
    assert "quiero" in cleaned
    assert "hora" in cleaned
    assert "lunes" in cleaned
    assert result["normalization_applied"] is True
    assert 0.0 <= result["confidence"] <= 1.0
