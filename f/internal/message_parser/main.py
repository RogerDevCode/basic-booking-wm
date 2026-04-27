from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ParserInput(BaseModel):
    model_config = ConfigDict(strict=True)
    text: str
    chat_id: str


class ParserResult(BaseModel):
    model_config = ConfigDict(strict=True)
    success: bool
    data: dict[str, object]


async def main(args: dict[str, object]) -> dict[str, object]:
    try:
        input_data = ParserInput.model_validate(args)
    except Exception as e:
        return {"success": False, "error": f"validation_error: {e}"}

    # Basic parser implementation
    return {
        "success": True,
        "data": {"text": input_data.text, "chat_id": input_data.chat_id, "is_command": input_data.text.startswith("/")},
    }
