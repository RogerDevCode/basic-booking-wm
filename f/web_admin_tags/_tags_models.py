from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class CategoryRow(TypedDict):
    category_id: str
    name: str
    description: Optional[str]
    is_active: bool
    sort_order: int
    created_at: str
    tag_count: int

class TagRow(TypedDict):
    tag_id: str
    category_id: str
    category_name: str
    name: str
    description: Optional[str]
    color: str
    is_active: bool
    sort_order: int
    created_at: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    admin_user_id: str
    action: Literal[
        'list_categories', 'create_category', 'update_category', 'delete_category',
        'activate_category', 'deactivate_category', 'list_tags', 'create_tag',
        'update_tag', 'delete_tag', 'activate_tag', 'deactivate_tag', 'list_all'
    ]
    category_id: Optional[str] = None
    tag_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: Optional[int] = Field(None, ge=0, le=999)
    is_active: Optional[bool] = None
