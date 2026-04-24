from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class SpecialtyRow(TypedDict):
    specialty_id: str
    name: str
    description: Optional[str]
    category: Optional[str]
    is_active: bool
    sort_order: int
    created_at: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    admin_user_id: str
    action: Literal['list', 'create', 'update', 'delete', 'activate', 'deactivate']
    specialty_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=50)
    sort_order: Optional[int] = Field(None, ge=0, le=999)
