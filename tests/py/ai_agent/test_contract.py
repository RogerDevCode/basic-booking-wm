from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from f.internal.ai_agent._constants import INTENT
from f.internal.ai_agent.main import _main_async as main


@pytest.mark.asyncio
async def test_ai_agent_tfidf_high_confidence_skips_llm() -> None:
    """TF-IDF confidence >= 0.9 must skip LLM and preserve the result."""
    mock_llm_res = MagicMock()
    mock_llm_res.content = (
        '{"intent": "pregunta_general", "confidence": 0.7, "entities": {}, "needs_more": false, "follow_up": null}'
    )
    mock_llm_res.provider = "openai"

    with (
        patch("f.internal.ai_agent._llm_client.get_variable", return_value="openai"),
        patch("f.internal.ai_agent.main.call_llm", AsyncMock(return_value=(None, mock_llm_res))),
    ):
        args: dict[str, Any] = {
            "chat_id": "c1",
            "text": "quiero una cita para mañana",
            "user_profile": {"is_first_time": False, "booking_count": 5},
        }

        res = await main({"chat_id": str(args["chat_id"]), "text": str(args["text"])})

        assert res is not None
        assert res["success"] is True
        data = cast("dict[str, Any]", res["data"])
        assert data["intent"] == INTENT["CREAR_CITA"]
        # TF-IDF keyword match returns 0.95; LLM must NOT override it
        assert data["confidence"] == 0.95


@pytest.mark.asyncio
async def test_ai_agent_social_fast_path() -> None:
    args: dict[str, Any] = {
        "chat_id": "c1",
        "text": "hola",
        "user_profile": {"is_first_time": True, "booking_count": 0},
    }

    res = await main({"chat_id": str(args["chat_id"]), "text": str(args["text"])})

    assert res is not None

    assert res["success"] is True
    assert cast("dict[str, Any]", res["data"])["intent"] == INTENT["SALUDO"]
    assert cast("dict[str, Any]", res["data"])["confidence"] > 0.8
    # Simplified logic in Python version currently doesn't add "bienvenido"
    assert "ayudarte" in cast("dict[str, Any]", res["data"])["ai_response"].lower()


@pytest.mark.asyncio
async def test_crear_cita_from_idle_requires_fsm() -> None:
    """INVARIANTE 1: booking intent desde idle → requires_fsm_routing = True."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "text": "quiero agendar una cita",
        "conversation_state": {
            "active_flow": "none",
            "flow_step": 0,
            "pending_data": {},
            "booking_state_name": "idle",
        },
    }
    res = await main(args)
    assert res["success"] is True
    data = cast("dict[str, Any]", res["data"])
    assert data["requires_fsm_routing"] is True
    assert data["intent"] == INTENT["CREAR_CITA"]


@pytest.mark.asyncio
async def test_mid_fsm_interrupt_intent_allows_conversational() -> None:
    """INVARIANT 2: FSM en curso + interrupt intent (alta confianza) → requires_fsm_routing = False."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "text": "hola",
        "conversation_state": {
            "active_flow": "none",
            "flow_step": 0,
            "pending_data": {},
            "booking_state_name": "selecting_doctor",
        },
    }
    res = await main(args)
    assert res["success"] is True
    data = cast("dict[str, Any]", res["data"])
    # "hola" → saludo (0.95 fast-path) → interrupt intent → allows conversational router
    assert data["requires_fsm_routing"] is False
    assert data["intent"] == INTENT["SALUDO"]


@pytest.mark.asyncio
async def test_mid_fsm_non_interrupt_requires_fsm() -> None:
    """INVARIANT 2b: FSM en curso + non-interrupt intent → requires_fsm_routing = True."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "text": "quiero una cita",
        "conversation_state": {
            "active_flow": "none",
            "flow_step": 0,
            "pending_data": {},
            "booking_state_name": "selecting_doctor",
        },
    }
    res = await main(args)
    assert res["success"] is True
    data = cast("dict[str, Any]", res["data"])
    assert data["requires_fsm_routing"] is True


@pytest.mark.asyncio
async def test_greeting_from_idle_no_fsm() -> None:
    """INVARIANTE 3: saludo desde idle → requires_fsm_routing = False."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "text": "hola",
        "conversation_state": {
            "active_flow": "none",
            "flow_step": 0,
            "pending_data": {},
            "booking_state_name": "idle",
        },
    }
    res = await main(args)
    assert res["success"] is True
    data = cast("dict[str, Any]", res["data"])
    assert data["requires_fsm_routing"] is False
    assert data["intent"] == INTENT["SALUDO"]


@pytest.mark.asyncio
async def test_desconocido_from_idle_no_fsm() -> None:
    """INVARIANTE: desconocido desde idle → requires_fsm_routing = False."""
    args: dict[str, Any] = {
        "chat_id": "1",
        "text": "asdfghjklqwerty",
        "conversation_state": {
            "active_flow": "none",
            "flow_step": 0,
            "pending_data": {},
            "booking_state_name": "idle",
        },
    }
    res = await main(args)
    assert res["success"] is True
    data = cast("dict[str, Any]", res["data"])
    assert data["requires_fsm_routing"] is False


@pytest.mark.asyncio
async def test_entity_extraction_day_with_accent() -> None:
    """BUGFIX: 'miércoles' con tilde debe extraerse como date entity."""
    from f.internal._nlu_cache import _NLU_CACHE

    _NLU_CACHE.clear()

    with patch("f.internal._nlu_cache.create_redis_client", side_effect=Exception("Redis unavailable")):
        args: dict[str, Any] = {
            "chat_id": "1",
            "text": "quiero hora para el miércoles",
            "conversation_state": {
                "active_flow": "none",
                "flow_step": 0,
                "pending_data": {},
                "booking_state_name": "idle",
            },
        }
        res = await main(args)

    assert res["success"] is True
    data = cast("dict[str, Any]", res["data"])
    entities = data.get("entities", {})
    assert entities.get("date") is not None, "Date entity should be extracted from 'miércoles'"


@pytest.mark.asyncio
async def test_entity_extraction_day_without_accent() -> None:
    """'miercoles' sin tilde debe extraerse como date entity."""
    from f.internal._nlu_cache import _NLU_CACHE

    _NLU_CACHE.clear()

    with patch("f.internal._nlu_cache.create_redis_client", side_effect=Exception("Redis unavailable")):
        args: dict[str, Any] = {
            "chat_id": "1",
            "text": "quiero hora para el miercoles",
            "conversation_state": {
                "active_flow": "none",
                "flow_step": 0,
                "pending_data": {},
                "booking_state_name": "idle",
            },
        }
        res = await main(args)

    assert res["success"] is True
    data = cast("dict[str, Any]", res["data"])
    entities = data.get("entities", {})
    assert entities.get("date") is not None, "Date entity should be extracted from 'miercoles'"
