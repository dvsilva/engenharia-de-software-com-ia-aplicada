import random
import time

from domain.errors import IncidentNotFoundError
from domain.types import Alert, AlertStatus, Incident, Service, Severity


def now_ms() -> int:
    return time.time_ns() // 1_000_000


class InMemoryStore:
    def __init__(self) -> None:
        self._services: list[Service] = []
        self._alerts: list[Alert] = []
        self._incidents: list[Incident] = []

    def seed(self, services: list[Service], alerts: list[Alert]) -> None:
        self._services = [{**service} for service in services]
        self._alerts = [{**alert} for alert in alerts]
        self._incidents = []

    def get_alerts(self, status: AlertStatus | None = None) -> list[Alert]:
        return [
            {**alert}
            for alert in self._alerts
            if status is None or alert["status"] == status
        ]

    def create_incident(self, title: str, service: str, severity: Severity) -> Incident:
        incident: Incident = {
            "id": self._generate_incident_id(),
            "title": title,
            "service": service,
            "severity": severity,
            "status": "open",
            "created_at": now_ms(),
            "resolved_at": None,
        }

        self._incidents.append(incident)

        return {**incident}

    def resolve_incident(self, id: str) -> Incident:
        incident = next((item for item in self._incidents if item["id"] == id), None)

        if incident is None:
            raise IncidentNotFoundError(id)

        incident["status"] = "resolved"
        incident["resolved_at"] = now_ms()

        return {**incident}

    def get_incidents(self) -> list[Incident]:
        return [{**incident} for incident in self._incidents]

    def _generate_incident_id(self) -> str:
        return f"inc-{now_ms()}-{random.getrandbits(16):04x}"
