from datetime import UTC, datetime
from typing import Annotated, Literal

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field, field_validator

from domain.errors import IncidentNotFoundError
from domain.types import Severity, Store
from store.in_memory_store import now_ms

AlertFilter = Literal["firing", "resolved", "all"]
NonEmptyText = Annotated[str, Field(min_length=1)]


class ListAlertsInput(BaseModel):
    status: AlertFilter = "firing"

    @field_validator("status", mode="before")
    @classmethod
    def default_to_firing(cls, value: object) -> object:
        return "firing" if value is None else value


class OpenIncidentInput(BaseModel):
    title: NonEmptyText
    service: NonEmptyText
    severity: Severity


class ResolveIncidentInput(BaseModel):
    id: NonEmptyText


def to_iso(milliseconds: int) -> str:
    moment = datetime.fromtimestamp(milliseconds / 1000, tz=UTC)

    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def create_list_alerts_tool(store: Store) -> BaseTool:
    async def list_alerts(status: AlertFilter = "firing") -> str:
        alerts = store.get_alerts() if status == "all" else store.get_alerts(status)

        if not alerts:
            return "No alerts found." if status == "all" else f"No {status} alerts found."

        scope = "alert(s)" if status == "all" else f"{status} alert(s)"
        lines = [
            f"- [{alert['id']}] {alert['service']} | {alert['severity']} | {alert['description']}"
            for alert in alerts
        ]

        return "\n".join([f"Found {len(alerts)} {scope}:", *lines])

    return StructuredTool.from_function(
        coroutine=list_alerts,
        name="list_alerts",
        description="List alerts by status.",
        args_schema=ListAlertsInput,
    )


def create_open_incident_tool(store: Store) -> BaseTool:
    async def open_incident(title: str, service: str, severity: Severity) -> str:
        incident = store.create_incident(title, service, severity)

        return "\n".join(
            [
                f"Incident created successfully. ID: {incident['id']}",
                f"Title: {incident['title']}",
                f"Service: {incident['service']}",
                f"Severity: {incident['severity']}",
                f"Status: {incident['status']}",
            ]
        )

    return StructuredTool.from_function(
        coroutine=open_incident,
        name="open_incident",
        description=(
            "Open a new incident for a service. severity must be critical|high|medium|low "
            "(sev1=critical, sev2=high, sev3=medium, sev4=low). "
            "Use exact service names from the user request."
        ),
        args_schema=OpenIncidentInput,
    )


def create_resolve_incident_tool(store: Store) -> BaseTool:
    async def resolve_incident(id: str) -> str:
        try:
            incident = store.resolve_incident(id)
        except IncidentNotFoundError as error:
            return f"Error: {error}"

        return "\n".join(
            [
                f"Incident {incident['id']} has been resolved.",
                f"Service: {incident['service']}",
                f"Resolved at: {to_iso(incident['resolved_at'] or now_ms())}",
            ]
        )

    return StructuredTool.from_function(
        coroutine=resolve_incident,
        name="resolve_incident",
        description="Resolve an existing incident by id.",
        args_schema=ResolveIncidentInput,
    )


def create_tools(store: Store) -> list[BaseTool]:
    return [
        create_list_alerts_tool(store),
        create_open_incident_tool(store),
        create_resolve_incident_tool(store),
    ]
