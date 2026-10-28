import asyncio
import unittest
from collections.abc import Awaitable, Callable

from langchain_openai import ChatOpenAI

from arena import create_strategy, parse_args
from domain.types import StrategyResult, TraceEvent
from strategies.plan_execute import PlanExecuteStrategy
from strategies.react import ReactStrategy
from strategies.reflect import (
    CritiqueResult,
    create_llm_critic,
    enrich_input_with_feedback,
    with_reflection,
)

Run = Callable[[str], Awaitable[StrategyResult]]


def default_result(input: str) -> StrategyResult:
    return {
        "answer": f"answer-for:{input}",
        "trace": [
            {"type": "observation", "content": "obs-1"},
            {"type": "answer", "content": f"answer-for:{input}"},
        ],
        "metrics": {"llm_calls": 1, "latency_ms": 10},
    }


class MockBase:
    def __init__(self, name: str = "react", run: Run | None = None) -> None:
        self.name = name
        self.calls: list[str] = []
        self._run = run

    async def run(self, input: str) -> StrategyResult:
        self.calls.append(input)

        if self._run is None:
            return default_result(input)

        return await self._run(input)


class SequenceCritic:
    def __init__(self, results: list[CritiqueResult]) -> None:
        self.calls = 0
        self._results = results

    async def __call__(
        self, answer: str, trace: list[TraceEvent], original_input: str
    ) -> CritiqueResult:
        result = self._results[min(self.calls, len(self._results) - 1)]
        self.calls += 1

        return result


def critique(approved: bool, feedback: str) -> CritiqueResult:
    return CritiqueResult(approved=approved, feedback=feedback)


def critiques_of(trace: list[TraceEvent]) -> list[TraceEvent]:
    return [event for event in trace if event["type"] == "critique"]


def unused_model() -> ChatOpenAI:
    raise RuntimeError("unused")


async def approve(
    answer: str, trace: list[TraceEvent], original_input: str
) -> CritiqueResult:
    return critique(True, "")


class ReflectionLoopTest(unittest.IsolatedAsyncioTestCase):
    async def test_immediate_approval_calls_the_base_once(self) -> None:
        base = MockBase()
        critic = SequenceCritic([critique(True, "ok")])

        result = await with_reflection(base, critic=critic).run("list alerts")
        critiques = critiques_of(result["trace"])

        self.assertEqual(len(base.calls), 1)
        self.assertEqual(critic.calls, 1)
        self.assertEqual(len(critiques), 1)
        self.assertEqual(critiques[0].get("approved"), True)
        self.assertEqual(critiques[0].get("round"), 1)
        self.assertEqual(critiques[0]["content"], "ok")

    async def test_rejection_regenerates_with_the_feedback_prepended(self) -> None:
        base = MockBase()
        critic = SequenceCritic(
            [critique(False, "Resposta incompleta"), critique(True, "ok")]
        )

        result = await with_reflection(base, critic=critic).run("pedido original")
        critiques = critiques_of(result["trace"])

        self.assertEqual(len(base.calls), 2)
        self.assertEqual(base.calls[0], "pedido original")
        self.assertIn("[Critique - Round 1]", base.calls[1])
        self.assertIn("Resposta incompleta", base.calls[1])
        self.assertIn("Original request:\npedido original", base.calls[1])
        self.assertEqual(len(critiques), 2)
        self.assertEqual(critiques[0].get("approved"), False)
        self.assertEqual(critiques[1].get("approved"), True)

    async def test_default_two_rounds_of_rejection_run_the_base_three_times(
        self,
    ) -> None:
        base = MockBase()
        critic = SequenceCritic([critique(False, "incomplete")])

        result = await with_reflection(base, critic=critic).run("q")
        critiques = critiques_of(result["trace"])

        self.assertEqual(len(base.calls), 3)
        self.assertEqual(critic.calls, 2)
        self.assertEqual([event.get("round") for event in critiques], [1, 2])

    async def test_zero_reflections_never_call_the_critic(self) -> None:
        base = MockBase()
        critic = SequenceCritic([critique(False, "x")])

        result = await with_reflection(base, max_reflections=0, critic=critic).run("q")

        self.assertEqual(len(base.calls), 1)
        self.assertEqual(critic.calls, 0)
        self.assertEqual(critiques_of(result["trace"]), [])

    async def test_base_strategy_error_propagates_unmodified(self) -> None:
        error = RuntimeError("base failed")

        async def fail(input: str) -> StrategyResult:
            raise error

        strategy = with_reflection(MockBase(run=fail), critic=approve)

        with self.assertRaises(RuntimeError) as raised:
            await strategy.run("q")

        self.assertIs(raised.exception, error)

    async def test_empty_feedback_injects_a_placeholder(self) -> None:
        base = MockBase()
        critic = SequenceCritic([critique(False, ""), critique(True, "")])

        await with_reflection(base, critic=critic).run("pedido")

        self.assertEqual(len(base.calls), 2)
        self.assertIn("(sem feedback adicional)", base.calls[1])
        self.assertEqual(
            enrich_input_with_feedback("pedido", 1, ""),
            "[Critique - Round 1]:\n(sem feedback adicional)\n\nOriginal request:\npedido",
        )

    def test_decorated_name_prefixes_the_base_name(self) -> None:
        strategy = with_reflection(MockBase(name="react"), critic=approve)

        self.assertEqual(strategy.name, "reflect:react")


class ReflectionMetricsTest(unittest.IsolatedAsyncioTestCase):
    async def test_immediate_approval_adds_one_call_to_the_base(self) -> None:
        async def two_calls(input: str) -> StrategyResult:
            return {
                "answer": "a",
                "trace": [{"type": "answer", "content": "a"}],
                "metrics": {"llm_calls": 2, "latency_ms": 5},
            }

        strategy = with_reflection(
            MockBase(run=two_calls), critic=SequenceCritic([critique(True, "ok")])
        )

        result = await strategy.run("q")

        self.assertEqual(result["metrics"]["llm_calls"], 3)

    async def test_one_cycle_counts_both_runs_and_both_critiques(self) -> None:
        critic = SequenceCritic([critique(False, "fix"), critique(True, "ok")])

        result = await with_reflection(MockBase(), critic=critic).run("q")

        self.assertEqual(result["metrics"]["llm_calls"], 4)

    async def test_two_rejections_count_five_calls(self) -> None:
        critic = SequenceCritic([critique(False, "incomplete")])

        result = await with_reflection(MockBase(), max_reflections=2, critic=critic).run(
            "q"
        )

        self.assertEqual(result["metrics"]["llm_calls"], 5)

    async def test_latency_covers_the_whole_run(self) -> None:
        async def slow_base(input: str) -> StrategyResult:
            await asyncio.sleep(0.02)

            return {
                "answer": "a",
                "trace": [{"type": "answer", "content": "a"}],
                "metrics": {"llm_calls": 1, "latency_ms": 1},
            }

        async def slow_critic(
            answer: str, trace: list[TraceEvent], original_input: str
        ) -> CritiqueResult:
            await asyncio.sleep(0.02)

            return critique(True, "ok")

        result = await with_reflection(MockBase(run=slow_base), critic=slow_critic).run(
            "q"
        )

        self.assertGreaterEqual(result["metrics"]["latency_ms"], 35)


class ReflectionWiringTest(unittest.IsolatedAsyncioTestCase):
    def test_reflection_over_react_is_named_reflect_react(self) -> None:
        strategy = with_reflection(
            ReactStrategy(unused_model, [], max_iterations=1), max_reflections=0
        )

        self.assertEqual(strategy.name, "reflect:react")

    def test_reflection_over_plan_and_execute_is_named_reflect_plan_and_execute(
        self,
    ) -> None:
        strategy = with_reflection(
            PlanExecuteStrategy(unused_model, [], max_iterations=1), max_reflections=0
        )

        self.assertEqual(strategy.name, "reflect:plan-and-execute")

    def test_arena_creates_the_reflection_strategies(self) -> None:
        self.assertEqual(create_strategy("reflect:react", 1).name, "reflect:react")
        self.assertEqual(
            create_strategy("reflect:plan-and-execute", 1).name,
            "reflect:plan-and-execute",
        )

    def test_arena_accepts_reflection_names_and_lists_all_four_on_invalid(
        self,
    ) -> None:
        parsed = parse_args(["--strategies", "reflect:react,reflect:plan-and-execute"])

        self.assertEqual(
            parsed["strategies"], ["reflect:react", "reflect:plan-and-execute"]
        )
        with self.assertRaisesRegex(
            ValueError, "react, plan-and-execute, reflect:react, reflect:plan-and-execute"
        ):
            parse_args(["--strategies", "nope"])

    async def test_llm_critic_approves_when_the_model_fails(self) -> None:
        critic = create_llm_critic(unused_model)

        result = await critic("answer", [{"type": "observation", "content": "o"}], "pedido")

        self.assertEqual(result, critique(True, ""))

    async def test_missing_critic_and_model_factory_passes_through(self) -> None:
        base = MockBase()

        result = await with_reflection(base, max_reflections=2).run("q")

        self.assertEqual(len(base.calls), 1)
        self.assertEqual(critiques_of(result["trace"]), [])
        self.assertEqual(result["metrics"]["llm_calls"], 1)
