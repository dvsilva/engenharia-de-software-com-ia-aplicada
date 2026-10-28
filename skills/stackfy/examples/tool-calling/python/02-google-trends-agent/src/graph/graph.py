from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from graph.nodes.researcher_node import create_researcher_node
from graph.nodes.responder_node import create_responder_node
from graph.state import GraphState
from services.open_router_service import OpenRouterService

TrendsGraph = CompiledStateGraph[GraphState, None, GraphState, GraphState]


def build_trends_graph(open_router_service: OpenRouterService) -> TrendsGraph:
    workflow = StateGraph(GraphState)

    workflow.add_node("researcher", create_researcher_node(open_router_service))
    workflow.add_node("responder", create_responder_node(open_router_service))

    workflow.add_edge(START, "researcher")
    workflow.add_edge("researcher", "responder")
    workflow.add_edge("responder", END)

    return workflow.compile()
