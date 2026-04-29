from typing import Any
from __future__ import annotations

import pytest

from f.telegram_menu._menu_logic import MenuController, parse_user_option


class TestParseUserOption:
    def test_cmd_book_callback_recognized(self) -> None:
        # Arrange: callback_data passed as user_input (the fix in flow.yaml)
        # Act
        result = parse_user_option("cmd:book")
        # Assert
        assert result == "book_appointment", "cmd:book must map to book_appointment"

    def test_cmd_mybookings_callback_recognized(self) -> None:
        result = parse_user_option("cmd:mybookings")
        assert result == "my_bookings"

    def test_agendar_text_recognized(self) -> None:
        result = parse_user_option("📅 Agendar Cita")
        assert result == "book_appointment"

    def test_mis_citas_text_recognized(self) -> None:
        result = parse_user_option("📋 Mis Citas")
        assert result == "my_bookings"

    def test_empty_string_returns_none(self) -> None:
        # Regression: empty text (no callback_data, no text) must NOT match
        result = parse_user_option("")
        assert result is None

    def test_random_input_returns_none(self) -> None:
        result = parse_user_option("hola que tal")
        assert result is None


class TestMenuController:
    @pytest.mark.asyncio
    async def test_start_action_shows_menu(self) -> None:
        from f.telegram_menu._menu_models import MenuInput

        ctrl = MenuController()
        resp = await ctrl.handle(MenuInput(action="start", chat_id="123"))
        assert resp.handled is True
        assert "AutoAgenda" in resp.response_text
        assert len(resp.inline_buttons) == 2

    @pytest.mark.asyncio
    async def test_select_option_cmd_book_not_handled_by_menu(self) -> None:
        """When callback_data=cmd:book arrives as user_input, menu must yield control (handled=False)."""
        from f.telegram_menu._menu_models import MenuInput

        ctrl = MenuController()
        resp = await ctrl.handle(MenuInput(action="select_option", chat_id="123", user_input="cmd:book"))
        assert resp.handled is False, "Menu must NOT handle cmd:book itself — orchestrator takes over"

    @pytest.mark.asyncio
    async def test_select_option_unknown_shows_error_menu(self) -> None:
        from f.telegram_menu._menu_models import MenuInput

        ctrl = MenuController()
        resp = await ctrl.handle(MenuInput(action="select_option", chat_id="123", user_input=""))
        assert resp.handled is True
        assert "Opción no reconocida" in resp.response_text
