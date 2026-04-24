from typing import Optional, List, Literal, TypedDict
from pydantic import BaseModel, ConfigDict, Field

class HonorificRow(TypedDict):
    honorific_id: str
    code: str
    label: str
    gender: Optional[str]
    sort_order: int
    is_active: bool
    created_at: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    tenant_id: str
    action: Literal['list', 'create', 'update', 'delete']
    honorific_id: Optional[str] = None
    code: Optional[str] = Field(None, max_length=10)
    label: Optional[str] = Field(None, max_length=10)
    gender: Optional[Literal['M', 'F', 'N']] = None
    sort_order: Optional[int] = Field(None, ge=0, le=999)
    is_active: Optional[bool] = None
