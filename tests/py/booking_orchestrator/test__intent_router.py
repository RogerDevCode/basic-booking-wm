from __future__ import annotations

from f.booking_orchestrator._intent_router import normalize_intent


def test_normalize_intent_crear_cita_returns_itself() -> None:
    assert normalize_intent("crear_cita") == "crear_cita"


def test_normalize_intent_cancelar_cita_returns_itself() -> None:
    assert normalize_intent("cancelar_cita") == "cancelar_cita"


def test_normalize_intent_reagendar_cita_returns_itself() -> None:
    assert normalize_intent("reagendar_cita") == "reagendar_cita"


def test_normalize_intent_ver_disponibilidad_returns_itself() -> None:
    assert normalize_intent("ver_disponibilidad") == "ver_disponibilidad"


def test_normalize_intent_mis_citas_returns_itself() -> None:
    assert normalize_intent("mis_citas") == "mis_citas"


def test_normalize_intent_legacy_reagendar_maps_to_reagendar_cita() -> None:
    assert normalize_intent("reagendar") == "reagendar_cita"


def test_normalize_intent_legacy_consultar_disponible_maps_to_ver_disponibilidad() -> None:
    assert normalize_intent("consultar_disponible") == "ver_disponibilidad"


def test_normalize_intent_legacy_consultar_disponibilidad_maps_to_ver_disponibilidad() -> None:
    assert normalize_intent("consultar_disponibilidad") == "ver_disponibilidad"


def test_normalize_intent_legacy_ver_mis_citas_maps_to_mis_citas() -> None:
    assert normalize_intent("ver_mis_citas") == "mis_citas"


def test_normalize_intent_unknown_intent_returns_none() -> None:
    assert normalize_intent("duda_general") is None


def test_normalize_intent_empty_string_returns_none() -> None:
    assert normalize_intent("") is None
