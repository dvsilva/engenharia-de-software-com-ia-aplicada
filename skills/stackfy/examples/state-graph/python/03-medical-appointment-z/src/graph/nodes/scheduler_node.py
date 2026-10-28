from dates import parse_date
from graph.nodes.required_fields import missing_fields
from graph.state import GraphState, Node, StateUpdate
from services.appointment_service import AppointmentService


def create_scheduler_node(
    appointment_service: AppointmentService,
) -> Node[StateUpdate]:
    def schedule(state: GraphState) -> StateUpdate:
        print("📅 Scheduling appointment...")

        try:
            missing = missing_fields(state)
            if missing:
                error_messages = ", ".join(missing)
                print(f"⚠️  Validation failed: {error_messages}")
                return {"actionSuccess": False, "actionError": error_messages}

            appointment = appointment_service.book_appointment(
                state["professionalId"],
                parse_date(state["datetime"]),
                state["patientName"],
                state.get("reason", "general consultation"),
            )

            print("✅ Appointment scheduled successfully")
            return {"actionSuccess": True, "appointmentData": appointment}
        except Exception as error:
            print(f"❌ Scheduling failed: {error}")
            return {"actionSuccess": False, "actionError": str(error)}

    return schedule
