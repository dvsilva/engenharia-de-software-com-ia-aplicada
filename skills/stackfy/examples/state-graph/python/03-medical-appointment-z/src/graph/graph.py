from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from graph.nodes.canceller_node import create_canceller_node
from graph.nodes.identify_intent_node import create_identify_intent_node
from graph.nodes.message_generator_node import create_message_generator_node
from graph.nodes.scheduler_node import create_scheduler_node
from graph.state import GraphState
from services.appointment_service import AppointmentService
from services.open_router_service import OpenRouterService

AppointmentGraph = CompiledStateGraph[GraphState, None, GraphState, GraphState]


def route_by_intent(state: GraphState) -> str:
    intent = state.get("intent", "unknown")

    if state.get("error") or intent == "unknown":
        return "message"

    print(f"➡️  Routing based on intent: {intent}")
    return intent


def build_appointment_graph(
    llm_client: OpenRouterService, appointment_service: AppointmentService
) -> AppointmentGraph:
    workflow = StateGraph(GraphState)

    workflow.add_node("identifyIntent", create_identify_intent_node(llm_client))
    workflow.add_node("schedule", create_scheduler_node(appointment_service))
    workflow.add_node("cancel", create_canceller_node(appointment_service))
    workflow.add_node("message", create_message_generator_node(llm_client))

    workflow.add_edge(START, "identifyIntent")
    workflow.add_conditional_edges(
        "identifyIntent",
        route_by_intent,
        {"schedule": "schedule", "cancel": "cancel", "message": "message"},
    )
    workflow.add_edge("schedule", "message")
    workflow.add_edge("cancel", "message")
    workflow.add_edge("message", END)

    return workflow.compile()
