from graph.graph import TrendsGraph, build_trends_graph
from services.open_router_service import OpenRouterService


def build_graph() -> TrendsGraph:
    return build_trends_graph(OpenRouterService())
