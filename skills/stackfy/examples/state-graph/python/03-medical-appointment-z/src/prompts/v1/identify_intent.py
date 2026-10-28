from datetime import UTC, datetime
from typing import Annotated, Literal, NotRequired, TypedDict

from pydantic import ConfigDict, Field, TypeAdapter, with_config

from dates import to_iso_string
from prompts.compact_json import to_compact_json
from services.appointment_service import Professional
from services.open_router_service import StructuredSchema

Intent = Literal["schedule", "cancel", "unknown"]


@with_config(ConfigDict(extra="forbid"))
class IntentData(TypedDict):
    intent: Annotated[Intent, Field(description="The user intent")]
    professionalId: NotRequired[
        Annotated[float, Field(description="ID of the medical professional")]
    ]
    professionalName: NotRequired[
        Annotated[str, Field(description="Name of the medical professional")]
    ]
    datetime: NotRequired[
        Annotated[str, Field(description="Appointment date and time in ISO format")]
    ]
    patientName: NotRequired[
        Annotated[str, Field(description="Patient name extracted from question")]
    ]
    reason: NotRequired[
        Annotated[str, Field(description="Reason for appointment (for scheduling)")]
    ]


intent_schema = StructuredSchema(TypeAdapter(IntentData))


def get_system_prompt(professionals: list[Professional]) -> str:
    return to_compact_json(
        {
            "role": "Intent Classifier for Medical Appointments",
            "task": "Identify user intent and extract all appointment-related details",
            "professionals": [
                {
                    "id": professional["id"],
                    "name": professional["name"],
                    "specialty": professional["specialty"],
                }
                for professional in professionals
            ],
            "current_date": to_iso_string(datetime.now(UTC)),
            "rules": {
                "schedule": {
                    "description": "User wants to book/schedule a new appointment",
                    "keywords": [
                        "schedule",
                        "book",
                        "appointment",
                        "I want to",
                        "make an appointment",
                    ],
                    "required_fields": ["professionalId", "datetime", "patientName"],
                    "optional_fields": ["reason"],
                },
                "cancel": {
                    "description": "User wants to cancel an existing appointment",
                    "keywords": [
                        "cancel",
                        "remove",
                        "delete",
                        "cancel my appointment",
                    ],
                    "required_fields": ["professionalId", "datetime", "patientName"],
                },
                "unknown": {
                    "description": "Anything not related to scheduling or cancelling appointments",
                    "examples": [
                        "weather questions",
                        "general info",
                        "unrelated queries",
                    ],
                },
            },
            "extraction_instructions": {
                "professionalId": "Match the professional name mentioned in the question to the ID from the professionals list. Use fuzzy matching.",
                "professionalName": "Extract the professional name as mentioned by the user",
                "datetime": "Parse relative dates (today, tomorrow) and times. Convert to ISO format. Use current_date as reference.",
                "patientName": "Extract the patient name from the question or context",
                "reason": "Extract the reason/purpose for the appointment (only for scheduling)",
            },
            "examples": [
                {
                    "input": "I want to schedule with Dr. Alicio da Silva for tomorrow at 4pm for a check-up",
                    "output": {
                        "intent": "schedule",
                        "professionalId": 1,
                        "professionalName": "Dr. Alicio da Silva",
                        "datetime": "2026-02-12T16:00:00.000Z",
                        "reason": "check-up",
                    },
                },
                {
                    "input": "Cancel my appointment with Dr. Ana Pereira today at 11am",
                    "output": {
                        "intent": "cancel",
                        "professionalId": 2,
                        "professionalName": "Dr. Ana Pereira",
                        "datetime": "2026-02-11T11:00:00.000Z",
                    },
                },
                {
                    "input": "What is the weather today?",
                    "output": {"intent": "unknown"},
                },
            ],
        }
    )


def get_user_prompt_template(question: str) -> str:
    return to_compact_json(
        {
            "question": question,
            "instructions": [
                "Carefully analyze the question to determine the user intent",
                "Extract all relevant appointment details",
                "Convert dates and times to ISO format",
                "Match professional names to their IDs",
                "Return only the fields that are present in the question",
            ],
        }
    )
