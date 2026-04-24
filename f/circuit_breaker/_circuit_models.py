from typing import Optional, Literal, TypedDict, List
from pydantic import BaseModel, ConfigDict, Field

class CircuitState(TypedDict):
    service_id: str
    state: Literal['closed', 'open', 'half-open']
    failure_count: int
    success_count: int
    failure_threshold: int
    success_threshold: int
    timeout_seconds: int
    opened_at: Optional[str]
    half_open_at: Optional[str]
    last_failure_at: Optional[str]
    last_success_at: Optional[str]
    last_error_message: Optional[str]

class CircuitBreakerResult(TypedDict, total=False):
    allowed: bool
    state: str
    retry_after: float
    message: str
    failure_count: int
    success_count: int
    error_message: str

class InputSchema(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    
    action: Literal['check', 'record_success', 'record_failure', 'reset', 'status']
    service_id: str = Field(min_length=1)
    error_message: Optional[str] = None
