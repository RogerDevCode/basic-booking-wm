from typing import Literal, Optional, List, Union, Annotated, Any, Dict, TypedDict
from pydantic import BaseModel, ConfigDict, Field, RootModel

# ============================================================================
# CONSTANTS & STEP NAMES (SSOT)
# ============================================================================

BookingStepName = Literal[
    'idle',
    'selecting_specialty',
    'selecting_doctor',
    'selecting_time',
    'confirming',
    'completed'
]

# ============================================================================
# BASE SCHEMAS
# ============================================================================

class NamedItem(TypedDict):
    id: str
    name: str

class TimeSlotItem(TypedDict):
    id: str
    label: str
    start_time: str

from typing import TypedDict

# ============================================================================
# DRAFT MODELS
# ============================================================================

class DraftCore(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    
    specialty_id: Optional[str] = None
    specialty_name: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    start_time: Optional[str] = None
    time_label: Optional[str] = None
    client_id: Optional[str] = None

class DraftBooking(DraftCore):
    target_date: Optional[str] = None
    provider_id: Optional[str] = None
    service_id: Optional[str] = None
    # Avoid circular dependency with BookingState for now
    last_state_name: Optional[BookingStepName] = None

def empty_draft() -> DraftBooking:
    return DraftBooking()

# ============================================================================
# STATE MODELS
# ============================================================================

class IdleState(BaseModel):
    name: Literal['idle'] = 'idle'

class SelectingSpecialtyState(BaseModel):
    name: Literal['selecting_specialty'] = 'selecting_specialty'
    error: Optional[str] = None
    items: List[NamedItem] = Field(default_factory=list)

class SelectingDoctorState(BaseModel):
    name: Literal['selecting_doctor'] = 'selecting_doctor'
    specialtyId: str
    specialtyName: str
    error: Optional[str] = None
    items: List[NamedItem] = Field(default_factory=list)

class SelectingTimeState(BaseModel):
    name: Literal['selecting_time'] = 'selecting_time'
    specialtyId: str
    doctorId: str
    doctorName: str
    targetDate: Optional[str] = None
    error: Optional[str] = None
    items: List[TimeSlotItem] = Field(default_factory=list)

class ConfirmingState(BaseModel):
    name: Literal['confirming'] = 'confirming'
    specialtyId: str
    doctorId: str
    doctorName: str
    timeSlot: str
    draft: DraftCore

class CompletedState(BaseModel):
    name: Literal['completed'] = 'completed'
    bookingId: str

# Discriminated Union for State
BookingState = Annotated[
    Union[
        IdleState,
        SelectingSpecialtyState,
        SelectingDoctorState,
        SelectingTimeState,
        ConfirmingState,
        CompletedState
    ],
    Field(discriminator='name')
]

class BookingStateRoot(RootModel[BookingState]):
    root: BookingState

# ============================================================================
# ACTION MODELS
# ============================================================================

class SelectAction(BaseModel):
    type: Literal['select'] = 'select'
    value: str

class SelectDateAction(BaseModel):
    type: Literal['select_date'] = 'select_date'
    value: str

class BackAction(BaseModel):
    type: Literal['back'] = 'back'

class CancelAction(BaseModel):
    type: Literal['cancel'] = 'cancel'

class ConfirmYesAction(BaseModel):
    type: Literal['confirm_yes'] = 'confirm_yes'

class ConfirmNoAction(BaseModel):
    type: Literal['confirm_no'] = 'confirm_no'

BookingAction = Annotated[
    Union[
        SelectAction,
        SelectDateAction,
        BackAction,
        CancelAction,
        ConfirmYesAction,
        ConfirmNoAction
    ],
    Field(discriminator='type')
]

# ============================================================================
# TRANSITION OUTCOME
# ============================================================================

class TransitionOutcome(TypedDict):
    nextState: BookingState
    responseText: str
    advance: bool

VALID_TRANSITIONS: Dict[BookingStepName, List[BookingStepName]] = {
    'idle': ['selecting_specialty'],
    'selecting_specialty': ['selecting_doctor', 'idle'],
    'selecting_doctor': ['selecting_time', 'selecting_specialty'],
    'selecting_time': ['confirming', 'selecting_doctor'],
    'confirming': ['completed', 'selecting_time'],
    'completed': ['idle'],
}
