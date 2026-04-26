from typing import Any
from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class RegionRow(TypedDict):
    region_id: int
    name: str
    code: str
    is_active: bool
    sort_order: int

class CommuneRow(TypedDict):
    commune_id: int
    name: str
    region_id: int
    region_name: str
    is_active: bool

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    action: Literal['list_regions', 'list_communes', 'search_communes']
    region_id: Optional[int] = None
    search: Optional[str] = Field(None, max_length=100)
