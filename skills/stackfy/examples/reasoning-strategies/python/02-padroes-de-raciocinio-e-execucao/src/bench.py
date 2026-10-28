import asyncio
import os
import re
import sys
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, NotRequired, TypedDict, get_args

from arena import parse_max_iterations
from domain.types import Incident, ReasoningStrategy
from llm.factory import create_model
from store.in_memory_store import InMemoryStore
from store.seed import seed_store
from strategies.plan_execute import PlanExecuteStrategy
from strategies.react import ReactStrategy
from tools import create_tools

ScenarioId = Literal["C1", "C2", "C3"]
StrategyId = Literal["react", "plan-and-execute"]


class BenchArgs(TypedDict):
    scenarios: list[ScenarioId]
    no_replanner: bool
    max_iterations: int


class BenchRow(TypedDict):
    cenario: ScenarioId
    estrategia: str
    acerto: bool
    llm_calls: int
    latency_ms: int
    error: NotRequired[str]
    reasons: NotRequired[list[str]]
    answer_preview: NotRequired[str]
    store_snapshot: NotRequired[str]


@dataclass(frozen=True)
class ScenarioDef:
    id: ScenarioId
    label: str
    prompt: str
    check: Callable[[InMemoryStore, str], bool]
    diagnose: Callable[[InMemoryStore, str], list[str]]


ALL_SCENARIOS: tuple[ScenarioId, ...] = get_args(ScenarioId)
ALL_STRATEGIES: tuple[StrategyId, ...] = get_args(StrategyId)

SEV2 = "high"

C2_SERVICES = ("checkout", "payment", "catalog")


def answer_mentions_count(answer: str, count: int) -> bool:
    return re.search(rf"(?<![0-9]){count}(?![0-9])", answer) is not None


def oldest_firing_service(store: InMemoryStore) -> str | None:
    firing = store.get_alerts("firing")

    return firing[0]["service"] if firing else None


def incidents_by_creation(store: InMemoryStore) -> list[Incident]:
    return sorted(store.get_incidents(), key=lambda incident: incident["created_at"])


def snapshot_store(store: InMemoryStore) -> str:
    incidents = "; ".join(
        f"{incident['id']}:{incident['service']}/{incident['severity']}/{incident['status']}"
        for incident in incidents_by_creation(store)
    )
    firing = "; ".join(
        f"{alert['id']}:{alert['service']}/{alert['severity']}"
        for alert in store.get_alerts("firing")
    )

    return f"incidents=[{incidents or 'none'}] firing=[{firing or 'none'}]"


def critical_firing(store: InMemoryStore) -> int:
    return sum(
        alert["severity"] == "critical" for alert in store.get_alerts("firing")
    )


def check_direct(store: InMemoryStore, answer: str) -> bool:
    return not store.get_incidents() and answer_mentions_count(
        answer, critical_firing(store)
    )


def diagnose_direct(store: InMemoryStore, answer: str) -> list[str]:
    expected = critical_firing(store)
    reasons: list[str] = []

    if store.get_incidents():
        reasons.append(f"esperava 0 incidentes, veio {len(store.get_incidents())}")
    if not answer_mentions_count(answer, expected):
        reasons.append(f"resposta não cita a contagem esperada {expected}")

    return reasons


def services_in_order(incidents: list[Incident]) -> bool:
    return len(incidents) >= len(C2_SERVICES) and all(
        incidents[index]["service"].lower() == service
        for index, service in enumerate(C2_SERVICES)
    )


def check_structured(store: InMemoryStore, answer: str) -> bool:
    incidents = incidents_by_creation(store)

    if len(incidents) != 3:
        return False

    return (
        services_in_order(incidents)
        and all(incident["severity"] == SEV2 for incident in incidents)
        and incidents[0]["status"] == "resolved"
        and all(incident["status"] == "open" for incident in incidents[1:])
    )


def diagnose_structured(store: InMemoryStore, answer: str) -> list[str]:
    incidents = incidents_by_creation(store)
    reasons: list[str] = []

    if len(incidents) != 3:
        reasons.append(f"esperava 3 incidentes, veio {len(incidents)}")
    if not services_in_order(incidents):
        services = ", ".join(incident["service"] for incident in incidents)
        reasons.append(
            f"serviços/ordem: [{services}] (esperado: {', '.join(C2_SERVICES)})"
        )

    wrong_severity = [incident for incident in incidents if incident["severity"] != SEV2]
    if wrong_severity:
        listed = ", ".join(
            f"{incident['service']}:{incident['severity']}" for incident in wrong_severity
        )
        reasons.append(f"severity≠high (sev2): {listed}")
    if incidents and incidents[0]["status"] != "resolved":
        reasons.append(
            f"primeiro incidente status={incidents[0]['status']} (esperado resolved)"
        )

    not_open = [incident for incident in incidents[1:] if incident["status"] != "open"]
    if not_open:
        listed = ", ".join(
            f"{incident['service']}:{incident['status']}" for incident in not_open
        )
        reasons.append(f"demais deveriam estar open: {listed}")

    return reasons


def check_dynamic(store: InMemoryStore, answer: str) -> bool:
    oldest_service = oldest_firing_service(store)
    incidents = store.get_incidents()

    if oldest_service is None or len(incidents) != 1:
        return False
    if incidents[0]["service"] != oldest_service or incidents[0]["status"] != "open":
        return False

    return answer_mentions_count(answer, len(store.get_alerts("firing")) - 1)


def diagnose_dynamic(store: InMemoryStore, answer: str) -> list[str]:
    oldest_service = oldest_firing_service(store)
    incidents = store.get_incidents()
    remaining = len(store.get_alerts("firing")) - 1
    reasons: list[str] = []

    if len(incidents) != 1:
        reasons.append(f"esperava 1 incidente, veio {len(incidents)}")
    if oldest_service and incidents and incidents[0]["service"] != oldest_service:
        reasons.append(
            f"serviço={incidents[0]['service']} (mais antigo firing={oldest_service})"
        )
    if incidents and incidents[0]["status"] != "open":
        reasons.append(f"incidente status={incidents[0]['status']} (esperado open)")
    if not answer_mentions_count(answer, remaining):
        reasons.append(f"resposta não cita quantos sobraram ({remaining})")

    return reasons


SCENARIOS = (
    ScenarioDef(
        "C1",
        "direto",
        "quantos alertas críticos estão disparando?",
        check_direct,
        diagnose_direct,
    ),
    ScenarioDef(
        "C2",
        "estruturado",
        "abra três incidentes sev2 para checkout, payment e catalog, nessa mesma ordem, e resolva o primeiro.",
        check_structured,
        diagnose_structured,
    ),
    ScenarioDef(
        "C3",
        "dinâmico",
        "dos alertas disparando, abra um incidente para o mais antigo e diga quantos sobraram",
        check_dynamic,
        diagnose_dynamic,
    ),
)


def parse_args(argv: list[str]) -> BenchArgs:
    flags: dict[str, str] = {}
    no_replanner = False
    index = 0

    while index < len(argv):
        token = argv[index]
        index += 1

        if token == "--no-replanner":
            no_replanner = True
        elif token.startswith("--"):
            flags[token] = argv[index] if index < len(argv) else ""
            index += 1

    raw_scenario = flags.get("--scenario", "").strip().upper()
    scenarios = list(ALL_SCENARIOS)

    if raw_scenario:
        if raw_scenario not in ALL_SCENARIOS:
            raise ValueError(f"Invalid --scenario. Use: {', '.join(ALL_SCENARIOS)}")
        scenarios = [raw_scenario]

    return {
        "scenarios": scenarios,
        "no_replanner": no_replanner,
        "max_iterations": parse_max_iterations(flags.get("--max-iterations")),
    }


def create_strategy(
    name: StrategyId, store: InMemoryStore, max_iterations: int, no_replanner: bool
) -> ReasoningStrategy:
    tools = create_tools(store)

    if name == "react":
        return ReactStrategy(create_model, tools, max_iterations)

    return PlanExecuteStrategy(
        create_model, tools, max_iterations, enable_replanner=not no_replanner
    )


def strategy_label(name: StrategyId, no_replanner: bool) -> str:
    if name == "plan-and-execute" and no_replanner:
        return "plan-and-execute (no-replanner)"

    return name


def print_table(rows: list[BenchRow]) -> None:
    headers = ["cenário", "estratégia", "acerto", "llmCalls", "latencyMs"]
    cells = [
        [
            row["cenario"],
            row["estrategia"],
            "sim" if row["acerto"] else "não",
            str(row["llm_calls"]),
            str(row["latency_ms"]),
        ]
        for row in rows
    ]
    widths = [
        max(len(header), *(len(row[column]) for row in cells))
        for column, header in enumerate(headers)
    ]

    def line(parts: list[str]) -> str:
        padded = " | ".join(part.ljust(widths[index]) for index, part in enumerate(parts))

        return f"| {padded} |"

    print(line(headers))
    print(f"|-{'-|-'.join('-' * width for width in widths)}-|")
    for row in cells:
        print(line(row))


async def run_cell(
    scenario: ScenarioDef, strategy_name: StrategyId, args: BenchArgs
) -> BenchRow:
    store = InMemoryStore()
    seed_store(store)
    strategy = create_strategy(
        strategy_name, store, args["max_iterations"], args["no_replanner"]
    )
    label = strategy_label(strategy_name, args["no_replanner"])

    try:
        result = await strategy.run(scenario.prompt)
    except Exception as error:
        return {
            "cenario": scenario.id,
            "estrategia": label,
            "acerto": False,
            "llm_calls": 0,
            "latency_ms": 0,
            "error": str(error),
        }

    row: BenchRow = {
        "cenario": scenario.id,
        "estrategia": label,
        "acerto": scenario.check(store, result["answer"]),
        "llm_calls": result["metrics"]["llm_calls"],
        "latency_ms": result["metrics"]["latency_ms"],
    }

    if row["acerto"]:
        return row

    return {
        **row,
        "reasons": scenario.diagnose(store, result["answer"]),
        "answer_preview": re.sub(r"\s+", " ", result["answer"]).strip()[:240],
        "store_snapshot": snapshot_store(store),
    }


def print_outcome(row: BenchRow) -> None:
    if row["acerto"]:
        print("ok")
        return
    if "error" in row:
        print(f"ERROR: {row['error']}")
        return

    print("miss")
    for reason in row.get("reasons", []):
        print(f"  - {reason}")
    if row.get("answer_preview"):
        print(f"  - answer: {row['answer_preview']}")
    if row.get("store_snapshot"):
        print(f"  - store: {row['store_snapshot']}")


async def main(argv: list[str]) -> int:
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise RuntimeError(
            "OPENROUTER_API_KEY environment variable is required. Set it in the environment (ex: OPENROUTER_API_KEY=... python src/bench.py)."
        )

    args = parse_args(argv)
    selected = [scenario for scenario in SCENARIOS if scenario.id in args["scenarios"]]
    rows: list[BenchRow] = []
    suffix = " [--no-replanner]" if args["no_replanner"] else ""

    print(
        f"Bench: {', '.join(scenario.id for scenario in selected)} × {', '.join(ALL_STRATEGIES)}{suffix}"
    )
    print()

    for scenario in selected:
        for strategy_name in ALL_STRATEGIES:
            print(f"Running {scenario.id} / {strategy_name}... ", end="", flush=True)
            row = await run_cell(scenario, strategy_name, args)
            rows.append(row)
            print_outcome(row)

    print()
    print_table(rows)

    return 1 if any(not row["acerto"] for row in rows) else 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main(sys.argv[1:])))
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
