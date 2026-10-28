from typing import Annotated, NotRequired, Protocol, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

from prompts.v1.identify_intent import Intent
from services.appointment_service import Appointment


class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    patientName: NotRequired[str]
    intent: NotRequired[Intent]
    professionalId: NotRequired[float]
    professionalName: NotRequired[str]
    datetime: NotRequired[str]
    reason: NotRequired[str]
    actionSuccess: NotRequired[bool]
    actionError: NotRequired[str]
    appointmentData: NotRequired[Appointment]
    error: NotRequired[str]


class StateUpdate(TypedDict, total=False):
    messages: list[AnyMessage]
    patientName: str
    intent: Intent
    professionalId: float
    professionalName: str
    datetime: str
    reason: str
    actionSuccess: bool
    actionError: str
    appointmentData: Appointment
    error: str


class Node[Update](Protocol):
    def __call__(self, state: GraphState) -> Update: ...
