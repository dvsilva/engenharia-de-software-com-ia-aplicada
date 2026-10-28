from dates import parse_date
from graph.nodes.required_fields import missing_fields
from graph.state import GraphState, Node, StateUpdate
from services.appointment_service import AppointmentService


def create_canceller_node(
    appointment_service: AppointmentService,
) -> Node[StateUpdate]:
    def cancel(state: GraphState) -> StateUpdate:
        try:
            print("❌ Cancelling appointment...")

            missing = missing_fields(state)
            if missing:
                error_messages = ", ".join(missing)
                print(f"⚠️  Validation failed: {error_messages}")
                return {"actionSuccess": False, "actionError": error_messages}

            appointment_service.cancel_appointment(
                state["professionalId"],
                state["patientName"],
                parse_date(state["datetime"]),
            )

            return {"actionSuccess": True}
        except Exception as error:
            print(f"❌ Cancellation failed: {error}")
            return {"actionSuccess": False, "actionError": str(error)}

    return cancel
