from __future__ import annotations

from f.message_preprocessor._modism_mapper import apply_modism_map

# --- Multi-word phrase substitutions ---


def test_modism_sacar_hora_replaced() -> None:
    text, matches = apply_modism_map("quiero sacar hora para mañana")
    assert "hacer una cita" in text
    assert any(m.phrase == "sacar hora" for m in matches)


def test_modism_pedir_hora_replaced() -> None:
    text, matches = apply_modism_map("necesito pedir hora con el doctor")
    assert "solicitar cita" in text
    assert any(m.phrase == "pedir hora" for m in matches)


def test_modism_tener_hora_replaced() -> None:
    # Map matches infinitive "tener hora", not conjugated "tengo hora"
    text, _ = apply_modism_map("no quiero tener hora tan temprano")
    assert "tener cita" in text


def test_modism_dar_hora_replaced() -> None:
    text, _ = apply_modism_map("me pueden dar hora para el viernes")
    assert "dar cita" in text


def test_modism_hay_hora_replaced() -> None:
    text, _ = apply_modism_map("hay hora disponible esta semana")
    assert "hay disponibilidad" in text


def test_modism_al_tiro_replaced() -> None:
    text, matches = apply_modism_map("necesito hora al tiro")
    assert "de inmediato" in text
    assert any(m.phrase == "al tiro" for m in matches)


# --- Single-word substitutions ---


def test_modism_kiero_replaced() -> None:
    text, matches = apply_modism_map("kiero una cita")
    assert "quiero" in text
    assert any(m.phrase == "kiero" for m in matches)


def test_modism_ora_replaced() -> None:
    text, matches = apply_modism_map("necesito una ora con el médico")
    assert "hora" in text
    assert any(m.phrase == "ora" for m in matches)


def test_modism_sita_replaced() -> None:
    text, matches = apply_modism_map("tengo una sita mañana")
    assert "cita" in text
    assert any(m.phrase == "sita" for m in matches)


def test_modism_manana_ascii_replaced() -> None:
    text, matches = apply_modism_map("quiero hora para manana")
    assert "mañana" in text
    assert any(m.phrase == "manana" for m in matches)


def test_modism_kanselame_replaced() -> None:
    text, _ = apply_modism_map("kanselame la hora del lunes")
    assert "cancélame" in text


def test_modism_kambiar_replaced() -> None:
    text, _ = apply_modism_map("necesito kambiar mi cita")
    assert "cambiar" in text


def test_modism_konsulta_replaced() -> None:
    text, _ = apply_modism_map("quiero una konsulta médica")
    assert "consulta" in text


def test_modism_orita_replaced() -> None:
    text, _ = apply_modism_map("necesito cita orita")
    assert "ahora" in text


def test_modism_pal_replaced() -> None:
    text, _ = apply_modism_map("hora pal viernes")
    assert "para el" in text


def test_modism_bieres_replaced() -> None:
    text, _ = apply_modism_map("hora para el bieres")
    assert "viernes" in text


# --- Filler removal ---


def test_modism_po_removed() -> None:
    text, matches = apply_modism_map("quiero una cita po")
    words = text.lower().split()
    assert "po" not in words
    assert any(m.phrase == "po" for m in matches)


def test_modism_weon_removed() -> None:
    text, matches = apply_modism_map("weon necesito hora")
    assert "weon" not in text.lower()
    assert any(m.phrase == "weon" for m in matches)


def test_modism_weon_accent_removed() -> None:
    text, _ = apply_modism_map("weón kiero una hora")
    assert "weón" not in text.lower()


def test_modism_all_fillers_result_is_clean() -> None:
    text, _ = apply_modism_map("po po po")
    assert text == ""


# --- Case insensitivity ---


def test_modism_uppercase_matched() -> None:
    text, matches = apply_modism_map("KIERO UNA CITA")
    assert matches  # at least one modism found
    assert "quiero" in text.lower()


def test_modism_mixed_case_matched() -> None:
    text, _ = apply_modism_map("Kiero sacar Hora")
    assert "quiero" in text.lower()


# --- Word boundary correctness ---


def test_modism_pal_not_in_hospital() -> None:
    text, matches = apply_modism_map("necesito ir al hospital")
    assert "hospital" in text
    assert not any(m.phrase == "pal" for m in matches)


def test_modism_lune_not_in_volume() -> None:
    # "lune" should not match inside other words
    text, matches = apply_modism_map("el volumen es alto")
    assert "volumen" in text
    assert not any(m.phrase == "lune" for m in matches)


def test_modism_po_not_in_poco() -> None:
    text, matches = apply_modism_map("un poco de tiempo")
    assert "poco" in text
    assert not any(m.phrase == "po" for m in matches)


# --- Multi-modism in single message ---


def test_modism_multiple_in_one_message() -> None:
    _, matches = apply_modism_map("kiero sacar hora al tiro po weon")
    phrases = [m.phrase for m in matches]
    assert "kiero" in phrases
    assert "sacar hora" in phrases
    assert "al tiro" in phrases
    assert "po" in phrases
    assert "weon" in phrases


def test_modism_canonical_in_output() -> None:
    for match in apply_modism_map("kiero sacar hora")[1]:
        assert match.canonical is not None


# --- Edge cases ---


def test_modism_empty_string() -> None:
    text, matches = apply_modism_map("")
    assert text == ""
    assert matches == []


def test_modism_clean_input_unchanged() -> None:
    original = "quiero cancelar mi cita del viernes"
    text, matches = apply_modism_map(original)
    assert text == original
    assert matches == []


def test_modism_whitespace_only() -> None:
    text, matches = apply_modism_map("   ")
    assert text == ""
    assert matches == []


def test_modism_returns_tuple() -> None:
    result = apply_modism_map("kiero hora")
    assert isinstance(result, tuple)
    assert len(result) == 2


def test_modism_match_has_phrase_and_canonical() -> None:
    _, matches = apply_modism_map("kiero una hora")
    for m in matches:
        assert isinstance(m.phrase, str)
        assert isinstance(m.canonical, str)
        assert len(m.phrase) > 0
