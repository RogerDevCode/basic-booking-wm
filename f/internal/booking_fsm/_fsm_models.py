from __future__ import annotations

from typing import Annotated, Literal, TypedDict

from pydantic import BaseModel, ConfigDict, Field, RootModel

# ============================================================================
# CONSTANTS & STEP NAMES (SSOT)
# ============================================================================

BookingStepName = Literal[
    "idle", "selecting_specialty", "selecting_doctor", "selecting_time", "confirming", "completed"
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


# ============================================================================
# DRAFT MODELS
# ============================================================================


class DraftCore(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    specialty_id: str | None = None
    specialty_name: str | None = None
    doctor_id: str | None = None
    doctor_name: str | None = None
    start_time: str | None = None
    time_label: str | None = None
    client_id: str | None = None


class DraftBooking(DraftCore):
    target_date: str | None = None
    provider_id: str | None = None
    service_id: str | None = None
    # Avoid circular dependency with BookingState for now
    last_state_name: BookingStepName | None = None


def empty_draft() -> DraftBooking:
    return DraftBooking()


# ============================================================================
# STATE MODELS
# ============================================================================


class IdleState(BaseModel):
    name: Literal["idle"] = "idle"


class SelectingSpecialtyState(BaseModel):
    name: Literal["selecting_specialty"] = "selecting_specialty"
    error: str | None = None
    items: list[NamedItem] = Field(default_factory=list)


class SelectingDoctorState(BaseModel):
    name: Literal["selecting_doctor"] = "selecting_doctor"
    specialtyId: str
    specialtyName: str
    error: str | None = None
    items: list[NamedItem] = Field(default_factory=list)


class SelectingTimeState(BaseModel):
    name: Literal["selecting_time"] = "selecting_time"
    specialtyId: str
    doctorId: str
    doctorName: str
    targetDate: str | None = None
    error: str | None = None
    items: list[TimeSlotItem] = Field(default_factory=list)


class ConfirmingState(BaseModel):
    name: Literal["confirming"] = "confirming"
    specialtyId: str
    doctorId: str
    doctorName: str
    timeSlot: str
    draft: DraftCore


class CompletedState(BaseModel):
    name: Literal["completed"] = "completed"
    bookingId: str


# Discriminated Union for State
BookingState = Annotated[
    IdleState | SelectingSpecialtyState | SelectingDoctorState | SelectingTimeState | ConfirmingState | CompletedState,
    Field(discriminator="name"),
]


class BookingStateRoot(RootModel[BookingState]):
    root: BookingState


# ============================================================================
# ACTION MODELS
# ============================================================================


class SelectAction(BaseModel):
    type: Literal["select"] = "select"
    value: str


class SelectDateAction(BaseModel):
    type: Literal["select_date"] = "select_date"
    value: str


class BackAction(BaseModel):
    type: Literal["back"] = "back"


class CancelAction(BaseModel):
    type: Literal["cancel"] = "cancel"


class ConfirmYesAction(BaseModel):
    type: Literal["confirm_yes"] = "confirm_yes"


class ConfirmNoAction(BaseModel):
    type: Literal["confirm_no"] = "confirm_no"


BookingAction = Annotated[
    SelectAction | SelectDateAction | BackAction | CancelAction | ConfirmYesAction | ConfirmNoAction,
    Field(discriminator="type"),
]

# ============================================================================
# TRANSITION OUTCOME
# ============================================================================


class TransitionOutcome(TypedDict):
    nextState: BookingState
    responseText: str
    advance: bool


VALID_TRANSITIONS: dict[BookingStepName, list[BookingStepName]] = {
    "idle": ["selecting_specialty"],
    "selecting_specialty": ["selecting_doctor", "idle"],
    "selecting_doctor": ["selecting_time", "selecting_specialty"],
    "selecting_time": ["confirming", "selecting_doctor"],
    "confirming": ["completed", "selecting_time"],
    "completed": ["idle"],
}
