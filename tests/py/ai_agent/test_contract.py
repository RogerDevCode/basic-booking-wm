from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from f.internal.ai_agent._constants import INTENT
from f.internal.ai_agent.main import main


@pytest.mark.asyncio
async def test_ai_agent_llm_success() -> None:
    mock_llm_res = MagicMock()
    mock_llm_res.content = '{"intent": "crear_cita", "confidence": 0.9, "entities": {"date": "mañana"}, "needs_more": false, "follow_up": null}'  # noqa: E501
    mock_llm_res.provider = "openai"

    # Patch in the right place
    with (
        patch("f.internal.ai_agent._llm_client.get_variable", return_value="openai"),
        patch("f.internal.ai_agent.main.call_llm", AsyncMock(return_value=(None, mock_llm_res))),
    ):
        args: dict[str, Any] = {
            "chat_id": "c1",
            "text": "quiero una cita para mañana",
            "user_profile": {"is_first_time": False, "booking_count": 5},
        }

        res = main(str(args["chat_id"]), str(args["text"]))

        assert res is not None

        assert res["success"] is True
        assert cast(dict[str, Any], res["data"])["intent"] == INTENT["CREAR_CITA"]
        assert cast(dict[str, Any], res["data"])["confidence"] == 0.9


@pytest.mark.asyncio
async def test_ai_agent_social_fast_path() -> None:
    args: dict[str, Any] = {"chat_id": "c1", "text": "hola", "user_profile": {"is_first_time": True, "booking_count": 0}}

    res = main(str(args["chat_id"]), str(args["text"]))

    assert res is not None

    assert res["success"] is True
    assert cast(dict[str, Any], res["data"])["intent"] == INTENT["SALUDO"]
    assert cast(dict[str, Any], res["data"])["confidence"] > 0.8
    # Simplified logic in Python version currently doesn't add "bienvenido"
    assert "ayudarte" in cast(dict[str, Any], res["data"])["ai_response"].lower()
