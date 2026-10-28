from graph.state import GraphState

REQUIRED_FIELDS = (
    ("professionalId", "Professional ID is required"),
    ("datetime", "Appointment datetime is required"),
    ("patientName", "Patient name is required"),
)


def missing_fields(state: GraphState) -> list[str]:
    return [message for field, message in REQUIRED_FIELDS if field not in state]
