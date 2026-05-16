from __future__ import annotations

import pytest

from f.internal.ai_agent.main import _main_async as main


class TestAIAgentRouting:
    @pytest.mark.asyncio
    async def test_crear_cita_from_idle_requires_fsm(self) -> None:
        args = {
            "chat_id": "1",
            "text": "quiero agendar una cita",
            "conversation_state": {
                "active_flow": "none",
                "flow_step": 0,
                "pending_data": {},
                "booking_state_name": "idle",
            },
        }
        # We need to mock LLM or use rules-based if possible.
        # "quiero agendar una cita" should match TF-IDF with high confidence.
        res = await main(args)
        assert res["data"]["intent"] == "crear_cita"
        assert res["data"]["requires_fsm_routing"] is True

    @pytest.mark.asyncio
    async def test_mid_fsm_always_requires_fsm(self) -> None:
        args = {
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
        assert res["data"]["requires_fsm_routing"] is True

    @pytest.mark.asyncio
    async def test_greeting_from_idle_no_fsm(self) -> None:
        args = {
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
        assert res["data"]["intent"] == "saludo"
        assert res["data"]["requires_fsm_routing"] is False
