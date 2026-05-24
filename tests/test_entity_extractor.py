from f.message_preprocessor._entity_extractor import _validate_rut, extract_entities


def test_extract_url() -> None:
    text, entities = extract_entities("Revisa mi sitio https://www.google.com por favor")
    assert entities.urls == ["https://www.google.com"]
    assert "[URL]" in text


def test_extract_phone() -> None:
    text, entities = extract_entities("Mi numero es +569 1234 5678")
    assert entities.phones == ["+56912345678"]
    assert "[TELEFONO]" in text


def test_extract_rut() -> None:
    text, entities = extract_entities("Mi rut es 12.345.678-5 y el de mi hermano 19.876.543-0")
    assert len(entities.ruts) == 2
    assert "[RUT]" in text


def test_validate_rut() -> None:
    assert _validate_rut("19.876.543-0")
    assert not _validate_rut("19.876.543-1")


def test_emojis() -> None:
    text, _ = extract_entities("Hola 👍 necesito hora ⏰")
    assert "[aprobacion]" in text
    assert "[reloj]" in text
    assert "👍" not in text
