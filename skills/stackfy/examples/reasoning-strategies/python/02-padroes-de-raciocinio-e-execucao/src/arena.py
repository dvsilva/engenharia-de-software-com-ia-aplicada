import asyncio
import os
import sys
from typing import Literal, TypedDict, get_args

from domain.types import ReasoningStrategy, StrategyResult, TraceEvent
from llm.factory import create_model
from store.in_memory_store import InMemoryStore
from store.seed import seed_store
from strategies.plan_execute import PlanExecuteStrategy
from strategies.react import ReactStrategy
from strategies.reflect import with_reflection
from tools import create_tools
from tracing.builder import compact_json

StrategyName = Literal[
    "react", "plan-and-execute", "reflect:react", "reflect:plan-and-execute"
]


class ArenaArgs(TypedDict):
    strategies: list[StrategyName]
    input: str
    max_iterations: int


DEFAULT_INPUT = "Quais serviços têm alertas ativos?"

VALID_STRATEGY_NAMES: tuple[StrategyName, ...] = get_args(StrategyName)

RULE = "════════════════════════════════════════"


def js_number(value: str) -> float:
    text = value.strip()

    if not text:
        return 0

    try:
        return float(text)
    except ValueError:
        return float("nan")


def parse_max_iterations(value: str | None) -> int:
    number = js_number(value) if value else 10

    if not float(number).is_integer() or number <= 0:
        raise ValueError("--max-iterations must be a positive integer")

    return int(number)


def parse_flags(argv: list[str]) -> tuple[dict[str, str], list[str]]:
    flags: dict[str, str] = {}
    positional: list[str] = []
    index = 0

    while index < len(argv):
        token = argv[index]

        if not token.startswith("--"):
            positional.append(token)
            index += 1
            continue

        flags[token] = argv[index + 1] if index + 1 < len(argv) else ""
        index += 2

    return flags, positional


def parse_args(argv: list[str]) -> ArenaArgs:
    flags, positional = parse_flags(argv)
    raw_strategies = flags.get("--strategies", "").strip()

    if not raw_strategies:
        raise ValueError("Missing required flag: --strategies")

    strategies = [
        name
        for value in raw_strategies.split(",")
        for name in VALID_STRATEGY_NAMES
        if value.strip() == name
    ]

    if not strategies:
        raise ValueError(
            "No valid strategies. Use: react, plan-and-execute, reflect:react, reflect:plan-and-execute"
        )

    input = flags["--input"] if "--input" in flags else " ".join(positional).strip()

    return {
        "strategies": strategies,
        "input": input or DEFAULT_INPUT,
        "max_iterations": parse_max_iterations(flags.get("--max-iterations")),
    }


def print_header(strategy_name: str) -> None:
    print(RULE)
    print(f"Strategy: {strategy_name}")
    print(RULE)
    print()


def format_trace_event(event: TraceEvent) -> str:
    if event["type"] == "action":
        return f"[action]      {event.get('tool', 'unknown')}({compact_json(event.get('tool_args', {}))})"

    return f"[{event['type']}]      {event['content']}"


def print_result(name: str, result: StrategyResult) -> None:
    print_header(name)
    print("── Trace ──────────────────────────────")
    for event in result["trace"]:
        print(format_trace_event(event))
    print()
    print("── Metrics ────────────────────────────")
    print(f"LLM calls:   {result['metrics']['llm_calls']}")
    print(f"Latency:     {result['metrics']['latency_ms']} ms")
    print()
    print("── Answer ─────────────────────────────")
    print(result["answer"])
    print()


def create_strategy(name: StrategyName, max_iterations: int) -> ReasoningStrategy:
    store = InMemoryStore()
    seed_store(store)
    tools = create_tools(store)

    if name == "react":
        return ReactStrategy(create_model, tools, max_iterations)
    if name == "plan-and-execute":
        return PlanExecuteStrategy(create_model, tools, max_iterations)
    if name == "reflect:react":
        return with_reflection(
            ReactStrategy(create_model, tools, max_iterations),
            model_factory=create_model,
        )

    return with_reflection(
        PlanExecuteStrategy(create_model, tools, max_iterations),
        model_factory=create_model,
    )


async def main(argv: list[str]) -> int:
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise RuntimeError(
            'OPENROUTER_API_KEY environment variable is required. Set it in the environment (ex: OPENROUTER_API_KEY=... python src/arena.py --strategies react --input "...").'
        )

    args = parse_args(argv)
    had_errors = False

    for strategy_name in args["strategies"]:
        try:
            strategy = create_strategy(strategy_name, args["max_iterations"])
            print_result(strategy_name, await strategy.run(args["input"]))
        except Exception as error:
            had_errors = True
            print_header(strategy_name)
            print(f"ERROR: {error}", file=sys.stderr)
            print()

    return 1 if had_errors else 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main(sys.argv[1:])))
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
