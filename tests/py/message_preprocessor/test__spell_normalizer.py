from __future__ import annotations

from f.message_preprocessor._spell_normalizer import apply_spell_correction

# --- No correction needed ---


def test_spell_correct_spanish_unchanged() -> None:
    text, corrections = apply_spell_correction("necesito cancelar mi cita")
    assert text == "necesito cancelar mi cita"
    assert corrections == []


def test_spell_domain_words_not_flagged() -> None:
    # Words loaded into custom dictionary should not be corrected
    _, corrections = apply_spell_correction("quiero agendar una consulta urgente")
    assert corrections == []


def test_spell_accented_words_not_flagged() -> None:
    _, corrections = apply_spell_correction("médico doctor disponibilidad")
    assert corrections == []


def test_spell_fonasa_not_corrupted_to_fogata() -> None:
    # Regression: pyspellchecker ES mangled "fonasa" → "fogata" (campfire),
    # silently corrupting a national health-institution name in user queries.
    text, corrections = apply_spell_correction("aceptan fonasa")
    assert "fonasa" in text
    assert "fogata" not in text
    assert not any(c.corrected == "fogata" for c in corrections)


def test_spell_surname_after_dr_title_not_corrupted() -> None:
    # Regression: "que horas tiene el dr gallegos" — surname after a title is a
    # dynamic provider name (providers table), must pass through untouched.
    text, corrections = apply_spell_correction("que horas tiene el dr gallegos")
    assert "gallegos" in text
    assert not any(c.original == "gallegos" for c in corrections)


def test_spell_surname_after_doctora_title_not_corrupted() -> None:
    # "muñoz" alone would be mangled to "muro"; after "doctora" it is protected.
    text, corrections = apply_spell_correction("la doctora muñoz tiene hora")
    assert "muñoz" in text
    assert "muro" not in text
    assert not any(c.original == "muñoz" for c in corrections)


def test_spell_title_word_itself_not_corrupted() -> None:
    text, corrections = apply_spell_correction("hablar con la dra soto")
    assert "dra" in text
    assert "soto" in text
    assert corrections == []


def test_spell_chilean_health_domain_terms_not_flagged() -> None:
    # Domain proper nouns / terms must pass through untouched (would otherwise
    # become: isapre→sabre, masvida→malvada, copago→copado, samu→sama,
    # redbanc→rebanco, webpay→espay, hemograma→heliograma, glicemia→glucemia).
    phrase = "isapre masvida copago samu redbanc webpay hemograma glicemia teleconsulta"
    text, corrections = apply_spell_correction(phrase)
    assert text == phrase
    assert corrections == []


# --- Short words skipped ---


def test_spell_two_char_word_skipped() -> None:
    _, corrections = apply_spell_correction("si no")
    assert corrections == []


def test_spell_one_char_word_skipped() -> None:
    _, corrections = apply_spell_correction("a y o")
    assert corrections == []


# --- Clear orthographic errors corrected ---


def test_spell_hospitl_corrected() -> None:
    text, corrections = apply_spell_correction("voy al hospitl")
    assert "hospital" in text
    assert any(c.original == "hospitl" for c in corrections)


def test_spell_urgnte_corrected() -> None:
    text, corrections = apply_spell_correction("es urgnte")
    assert "urgente" in text
    assert any(c.original == "urgnte" for c in corrections)


def test_spell_doctr_corrected() -> None:
    text, corrections = apply_spell_correction("el doctr atiende hoy")
    assert "doctor" in text
    assert any(c.original == "doctr" for c in corrections)


# --- Preserves non-word tokens ---


def test_spell_punctuation_preserved() -> None:
    text, _ = apply_spell_correction("hola, ¿cómo estás?")
    assert "," in text
    assert "¿" in text
    assert "?" in text


def test_spell_spaces_preserved() -> None:
    text, _ = apply_spell_correction("quiero una cita")
    assert " " in text


# --- Unknown word without suggestion passes through ---


def test_spell_unknown_no_suggestion_preserved() -> None:
    text, corrections = apply_spell_correction("xzqwpfmblrty")
    assert "xzqwpfmblrty" in text
    assert not any(c.original == "xzqwpfmblrty" for c in corrections)


# --- Correction structure ---


def test_spell_correction_has_original_and_corrected() -> None:
    _, corrections = apply_spell_correction("voy al hospitl manana")
    for c in corrections:
        assert isinstance(c.original, str)
        assert isinstance(c.corrected, str)
        assert c.original != c.corrected
        assert len(c.original) > 0
        assert len(c.corrected) > 0


def test_spell_correction_original_preserved_in_list() -> None:
    _, corrections = apply_spell_correction("urgnte hospitl")
    originals = [c.original for c in corrections]
    assert "urgnte" in originals or "hospitl" in originals


# --- Singleton consistency ---


def test_spell_singleton_same_result_on_repeat() -> None:
    r1, _ = apply_spell_correction("necesito cita")
    r2, _ = apply_spell_correction("necesito cita")
    assert r1 == r2


def test_spell_singleton_called_multiple_times() -> None:
    # Should not raise or degrade on repeated calls
    for _ in range(5):
        text, _ = apply_spell_correction("el doctr atiende hoy")
        assert "doctor" in text


# --- Empty and edge inputs ---


def test_spell_empty_string() -> None:
    text, corrections = apply_spell_correction("")
    assert text == ""
    assert corrections == []


def test_spell_only_spaces() -> None:
    _, corrections = apply_spell_correction("   ")
    assert corrections == []


def test_spell_numbers_not_corrected() -> None:
    text, corrections = apply_spell_correction("llamar al 123456")
    assert corrections == []
    assert "123456" in text
