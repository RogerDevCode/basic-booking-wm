from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class LogResult(TypedDict):
    message_id: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    client_id: Optional[str] = None
    provider_id: str
    channel: Literal['telegram', 'web', 'api']
    direction: Literal['incoming', 'outgoing']
    content: str = Field(min_length=1, max_length=2000)
    intent: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
