from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class Tag(TypedDict):
    tag_id: str
    name: str
    color: str

class NoteRow(TypedDict):
    note_id: str
    booking_id: Optional[str]
    client_id: Optional[str]
    provider_id: str
    content_encrypted: Optional[str]
    content: str
    encryption_version: int
    created_at: str
    updated_at: str
    tags: List[Tag]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    provider_id: str
    action: Literal['create', 'read', 'update', 'delete', 'list']
    note_id: Optional[str] = None
    booking_id: Optional[str] = None
    client_id: Optional[str] = None
    content: Optional[str] = Field(None, min_length=1, max_length=5000)
    tag_ids: List[str] = Field(default_factory=list)
