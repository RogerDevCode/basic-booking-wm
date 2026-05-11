from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel


class NamedItem(BaseModel):
    id: str
    name: str


class TimeSlotItem(BaseModel):
    id: str
    label: str
    start_time: str


class DraftCore(BaseModel):
    model_config = ConfigDict(strict=True)
    specialty_id: str | None = None
    specialty_name: str | None = None
    doctor_id: str | None = None
    doctor_name: str | None = None
    start_time: str | None = None
    time_label: str | None = None
    client_id: str | None = None


class DraftBooking(DraftCore):
    target_date: str | None = None
    reg_source: str | None = None
    reg_name: str | None = None
    reg_phone: str | None = None


class IdleState(BaseModel):
    name: Literal["idle"] = "idle"


class SelectingSpecialtyState(BaseModel):
    name: Literal["selecting_specialty"] = "selecting_specialty"
    items: list[dict[str, str]] = []
    error: str | None = None


class SelectingDoctorState(BaseModel):
    name: Literal["selecting_doctor"] = "selecting_doctor"
    specialtyId: str
    specialtyName: str
    items: list[dict[str, str]] = []
    error: str | None = None


class SelectingTimeState(BaseModel):
    name: Literal["selecting_time"] = "selecting_time"
    specialtyId: str
    doctorId: str
    doctorName: str
    targetDate: str | None = None
    items: list[dict[str, str]] = []
    error: str | None = None


class ConfirmingState(BaseModel):
    name: Literal["confirming"] = "confirming"
    specialtyId: str
    doctorId: str
    doctorName: str
    timeSlot: str
    draft: DraftCore
    invalid_attempts: int = 0


class CompletedState(BaseModel):
    name: Literal["completed"] = "completed"


BookingState = Annotated[
    IdleState | SelectingSpecialtyState | SelectingDoctorState | SelectingTimeState | ConfirmingState | CompletedState,
    Field(discriminator="name"),
]


class BookingStateRoot(RootModel[BookingState]):
    pass


class BackAction(BaseModel):
    type: Literal["back"] = "back"


class CancelAction(BaseModel):
    type: Literal["cancel"] = "cancel"


class SelectAction(BaseModel):
    type: Literal["select"] = "select"
    value: str


class SelectDateAction(BaseModel):
    type: Literal["select_date"] = "select_date"
    value: str


class ConfirmYesAction(BaseModel):
    type: Literal["confirm_yes"] = "confirm_yes"


class ConfirmNoAction(BaseModel):
    type: Literal["confirm_no"] = "confirm_no"


BookingAction = Annotated[
    BackAction | CancelAction | SelectAction | SelectDateAction | ConfirmYesAction | ConfirmNoAction,
    Field(discriminator="type"),
]


class TransitionOutcome(BaseModel):
    nextState: BookingState | None
    responseText: str
    advance: bool = False
