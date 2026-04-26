from typing import Any
from typing import Optional, List, Literal, Dict, Any, Union, Annotated, TypedDict
from pydantic import BaseModel, ConfigDict, Field, RootModel
from ._constants import INTENT, CONFIDENCE_BOUNDARIES

# ============================================================================
# AI AGENT — Data Models (v4.0)
# ============================================================================

# ── Conversation State (input context)
class ConversationState(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    previous_intent: Optional[str] = None
    active_flow: Literal[
        "booking_wizard", "reschedule_flow", "cancellation_flow", 
        "reminder_flow", "selecting_specialty", "selecting_datetime", "none"
    ] = "none"
    flow_step: int = Field(default=0, ge=0)
    pending_data: Dict[str, Any] = Field(default_factory=dict)
    last_user_utterance: Optional[str] = None

# ── User Profile
class UserProfile(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    is_first_time: bool
    booking_count: int = Field(ge=0)

# ── Input
class AIAgentInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    chat_id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=500)
    provider_id: Optional[str] = None
    conversation_state: Optional[ConversationState] = None
    user_profile: Optional[UserProfile] = None

# ── Entities
class EntityMap(BaseModel):
    model_config = ConfigDict(strict=True, extra="allow") # allow for custom keys
    
    date: Optional[str] = None
    time: Optional[str] = None
    provider_name: Optional[str] = None
    provider_id: Optional[str] = None
    service_type: Optional[str] = None
    service_id: Optional[str] = None
    booking_id: Optional[str] = None
    channel: Optional[str] = None
    reminder_window: Optional[str] = None

# ── Context
class AvailabilityContext(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    is_today: bool
    is_tomorrow: bool
    is_urgent: bool
    is_flexible: bool
    is_specific_date: bool
    time_preference: Literal["morning", "afternoon", "evening", "any"]
    day_preference: Optional[str] = None

class ContextAdjustment(TypedDict):
    adjusted: bool
    intent: str
    confidence: float
    reason: str

# ── Enums for Logic
SocialSubtype = Literal["saludo", "despedida", "agradecimiento"]
ReminderSubtype = Literal["activar", "desactivar", "preferencias"]
NavSubtype = Literal["menu", "siguiente", "atras", "confirmar"]
DialogueAct = Literal["inform", "question", "request_action", "confirm", "acknowledge", "offer", "close"]
UIComponent = Literal["text_message", "quick_replies", "form_card", "list_card", "confirmation_card", "warning_card", "menu_card"]
EscalationLevel = Literal["none", "priority_queue", "human_handoff", "medical_emergency"]

# ── Final Intent Result
class IntentResult(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    intent: str # Validated against INTENT list in logic
    confidence: float = Field(ge=0.0, le=1.0)
    entities: EntityMap
    context: AvailabilityContext
    subtype: Optional[Union[SocialSubtype, ReminderSubtype, NavSubtype]] = None
    dialogue_act: DialogueAct = "inform"
    ui_component: UIComponent = "text_message"
    needs_more_info: bool = False
    follow_up: Optional[str] = None
    ai_response: str = Field(min_length=1)
    requires_human: bool = False
    escalation_level: EscalationLevel = "none"
    cot_reasoning: str = Field(min_length=1)
    validation_passed: bool
    validation_errors: List[str] = Field(default_factory=list)

# ── Internal Support Models
class LLMOutputEntities(BaseModel):
    date: Optional[str] = None
    time: Optional[str] = None
    booking_id: Optional[str] = None
    client_name: Optional[str] = None
    service_type: Optional[str] = None

class LLMOutput(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")
    intent: str
    confidence: float
    entities: Optional[LLMOutputEntities] = None
    needs_more: bool = False
    follow_up: Optional[str] = None
