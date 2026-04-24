from typing import Optional, List, Literal, TypedDict, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class ModelCandidate(TypedDict):
    id: str
    name: str

class NLUIntent(BaseModel):
    intent: str
    confidence: float
    requires_human: bool

class ModelTestResult(TypedDict):
    model: str
    taskId: str
    success: bool
    rawResponse: Optional[str]
    parsed: Optional[Dict[str, Any]]
    error: Optional[str]
    correct: Optional[bool]
    latencyMs: int
    totalTokens: Optional[int]

class ModelSummary(TypedDict):
    model: str
    totalTasks: int
    passed: int
    failed: int
    correct: int
    avgLatencyMs: int
    results: List[ModelTestResult]

class BenchmarkReport(TypedDict):
    timestamp: str
    modelsTested: int
    summaries: List[ModelSummary]

class TaskPrompt(TypedDict):
    name: str
    userMessage: str
    expectedIntent: str
    expectedHuman: bool

class OpenRouterUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class OpenRouterChoiceMessage(BaseModel):
    content: str
    role: Optional[str] = None

class OpenRouterChoice(BaseModel):
    message: OpenRouterChoiceMessage
    finish_reason: Optional[str] = None

class OpenRouterResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    id: Optional[str] = None
    choices: List[OpenRouterChoice]
    usage: Optional[OpenRouterUsage] = None
