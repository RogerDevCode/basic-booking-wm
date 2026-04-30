from __future__ import annotations

from f.booking_wizard._wizard_logic import DateUtils, WizardUI
from f.booking_wizard._wizard_models import WizardState


class TestWizardLogic:
    """Unit tests for Booking Wizard logic."""

    def test_date_utils_format_es(self) -> None:
        # Arrange
        date_str = "2026-05-15"
        # Act
        res = DateUtils.format_es(date_str)
        # Assert
        assert "Mayo" in res
        assert "2026" not in res  # format_es usually doesn't include year in the label

    def test_wizard_ui_build_date_selection(self) -> None:
        # Arrange
        state = WizardState(client_id="c1", chat_id="chat1")
        # Act
        view = WizardUI.build_date_selection(state)
        # Assert
        assert "Elige una fecha" in view["message"]
        assert view["new_state"].step == 1
        assert len(view["reply_keyboard"]) >= 4

    def test_wizard_ui_build_time_selection(self) -> None:
        # Arrange
        state = WizardState(client_id="c1", chat_id="chat1", selected_date="2026-05-15")
        slots = ["10:00", "10:30", "11:00"]
        # Act
        view = WizardUI.build_time_selection(state, slots)
        # Assert
        assert "Elige un horario" in view["message"]
        assert view["new_state"].step == 2
        assert "10:00" in view["reply_keyboard"][0]

    def test_wizard_ui_build_confirmation(self) -> None:
        # Arrange
        state = WizardState(client_id="c1", chat_id="chat1", selected_date="2026-05-15", selected_time="10:00")
        # Act
        view = WizardUI.build_confirmation(state, "Dr. Garcia", "Consulta")
        # Assert
        assert "Confirma tu cita" in view["message"]
        assert "Dr. Garcia" in view["message"]
        assert view["new_state"].step == 3
