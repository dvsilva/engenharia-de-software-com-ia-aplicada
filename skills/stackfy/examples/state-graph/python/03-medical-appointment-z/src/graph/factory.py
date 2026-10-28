from config import config
from graph.graph import AppointmentGraph, build_appointment_graph
from services.appointment_service import AppointmentService
from services.open_router_service import OpenRouterService


def build_graph() -> AppointmentGraph:
    return build_appointment_graph(OpenRouterService(config), AppointmentService())
