from typing import Annotated, TypedDict

from pydantic import ConfigDict, Field, TypeAdapter, with_config

from prompts.compact_json import to_compact_json
from services.open_router_service import StructuredSchema


@with_config(ConfigDict(extra="forbid"))
class MessageResponse(TypedDict):
    message: Annotated[
        str, Field(min_length=10, description="Clear, friendly message for the user")
    ]


message_schema = StructuredSchema(TypeAdapter(MessageResponse))


def get_system_prompt() -> str:
    return to_compact_json(
        {
            "role": "Friendly Medical Receptionist",
            "task": "Generate clear, professional, and empathetic messages for patients",
            "tone": "Professional yet warm, clear and concise, empathetic",
            "guidelines": {
                "language": "Use simple, non-technical language",
                "format": "Clear and concise, avoid jargon",
                "personalization": "Include relevant details (names, dates, times)",
                "empathy": "Acknowledge patient emotions, especially for errors",
            },
            "scenarios": {
                "schedule_success": "Confirm the appointment with all details",
                "schedule_error": "Apologize and explain why scheduling failed",
                "cancel_success": "Confirm the cancellation",
                "cancel_error": "Apologize and explain why cancellation failed",
                "unknown": "Politely explain you can only help with appointments",
            },
        }
    )


def get_user_prompt_template(scenario: str, details: dict[str, str | None]) -> str:
    return to_compact_json(
        {
            "scenario": scenario,
            "details": {
                field: value for field, value in details.items() if value is not None
            },
            "instructions": [
                "Generate an appropriate message for the given scenario",
                "Include all relevant details from the details object",
                "Be clear and direct",
                "Show empathy, especially for errors",
                "For unknown intents, guide users back to scheduling/cancelling",
                "Answer in the same language as the question (preferably Portuguese)",
            ],
            "examples": {
                "schedule_success": "Sua consulta com o Dr. Alicio da Silva em 12 de fevereiro de 2026 às 16h foi confirmada para Maria Santos. Aguardamos sua visita!",
                "schedule_error": "Peço desculpas, mas esse horário já está reservado. Por favor, tente outro horário ou entre em contato conosco para verificar a disponibilidade.",
                "cancel_success": "Sua consulta com o Dr. Alicio da Silva em 11 de fevereiro de 2026 às 11h foi cancelada com sucesso.",
                "cancel_error": "Não encontrei nenhuma consulta com essas informações. Por favor, verifique a data, o horário e o nome do médico.",
                "unknown": "Posso ajudá-lo(a) a agendar ou cancelar consultas médicas. Como posso ajudá-lo(a) com sua consulta hoje?",
            },
        }
    )
