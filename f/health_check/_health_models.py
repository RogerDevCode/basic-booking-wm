from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class ComponentStatus(TypedDict):
    component: str
    status: Literal['healthy', 'degraded', 'unhealthy', 'not_configured']
    latency_ms: int
    message: str

class HealthResult(TypedDict):
    overall: Literal['healthy', 'degraded', 'unhealthy']
    timestamp: str
    components: List[ComponentStatus]

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    component: Literal['all', 'database', 'gcal', 'telegram', 'gmail'] = 'all'
