from __future__ import annotations

from f.booking_orchestrator._get_entity import get_entity


def test_get_entity_existing_key_returns_value() -> None:
    assert get_entity({"booking_id": "abc123"}, "booking_id") == "abc123"


def test_get_entity_missing_key_returns_none() -> None:
    assert get_entity({"booking_id": "abc123"}, "specialty_name") is None


def test_get_entity_key_with_none_value_returns_none() -> None:
    assert get_entity({"reason": None}, "reason") is None


def test_get_entity_empty_dict_returns_none() -> None:
    assert get_entity({}, "anything") is None
