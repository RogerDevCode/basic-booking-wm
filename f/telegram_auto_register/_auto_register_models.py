from typing import Optional, TypedDict
from pydantic import BaseModel, ConfigDict, Field

class RegisterResult(TypedDict):
    user_id: str
    is_new: bool

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    chat_id: str = Field(min_length=1)
    first_name: str = Field(min_length=1)
    last_name: Optional[str] = None
    username: Optional[str] = None
