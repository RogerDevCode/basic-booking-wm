import pytest
from f.telegram_menu.main import main

def test_telegram_menu_show() -> None:
    args = {"action": "show", "chat_id": "123"}
    result = main(args)
    
    assert result["success"] is True
    assert result["data"]["text"] == '🏥 *Menú Principal*\n\nSelecciona una opción:'
    assert len(result["data"]["reply_markup"]["keyboard"]) == 2

def test_telegram_menu_select_valid() -> None:
    args = {"action": "select_option", "chat_id": "123", "user_input": "1"}
    result = main(args)
    
    assert result["success"] is True
    assert result["data"]["action"] == "book_appointment"

def test_telegram_menu_select_invalid() -> None:
    args = {"action": "select_option", "chat_id": "123", "user_input": "invalid"}
    result = main(args)
    
    assert result["success"] is False
    assert result["error_message"] == "Invalid option selected"
    assert "Opción no reconocida" in result["data"]["text"]
