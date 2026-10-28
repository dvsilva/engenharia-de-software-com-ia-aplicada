from typing import Literal, NotRequired, Protocol, TypedDict

AlertStatus = Literal["firing", "resolved"]
IncidentStatus = Literal["open", "resolved"]
Severity = Literal["critical", "high", "medium", "low"]
TraceEventType = Literal[
    "thought", "action", "observation", "plan", "critique", "answer"
]


class Service(TypedDict):
    name: str


class Alert(TypedDict):
    id: str
    service: str
    description: str
    severity: Severity
    status: AlertStatus


class Incident(TypedDict):
    id: str
    title: str
    service: str
    severity: Severity
    status: IncidentStatus
    created_at: int
    resolved_at: int | None


class TraceEvent(TypedDict):
    type: TraceEventType
    content: str
    tool: NotRequired[str]
    tool_args: NotRequired[dict[str, object]]
    round: NotRequired[int]
    approved: NotRequired[bool]
    timestamp_ms: NotRequired[int]


class ExecutionMetrics(TypedDict):
    llm_calls: int
    latency_ms: int


class StrategyResult(TypedDict):
    answer: str
    trace: list[TraceEvent]
    metrics: ExecutionMetrics


class ReasoningStrategy(Protocol):
    @property
    def name(self) -> str: ...

    async def run(self, input: str) -> StrategyResult: ...


class Store(Protocol):
    def get_alerts(self, status: AlertStatus | None = None) -> list[Alert]: ...

    def create_incident(
        self, title: str, service: str, severity: Severity
    ) -> Incident: ...

    def resolve_incident(self, id: str) -> Incident: ...
