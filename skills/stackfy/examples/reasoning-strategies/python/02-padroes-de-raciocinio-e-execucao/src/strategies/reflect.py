from collections.abc import Awaitable, Callable

from pydantic import BaseModel, Field

from agents.react import ModelFactory
from domain.types import ReasoningStrategy, StrategyResult, TraceEvent
from store.in_memory_store import now_ms
from strategies.plan_execute import structured


class CritiqueResult(BaseModel):
    approved: bool
    feedback: str = Field(
        description="se não aprovado: o que corrigir, em específico e acionável"
    )


CriticFn = Callable[[str, list[TraceEvent], str], Awaitable[CritiqueResult]]

CRITIC_PROMPT = " ".join(
    [
        "Você é um crítico rigoroso de respostas de um agente de operações.",
        "Avalie APENAS contra as observações do trace e o pedido original.",
        "Não invente fatos que não apareçam nas observações.",
        "Se a resposta estiver completa e fiel às observações, approved=true.",
        "Se faltar informação exigida pelo pedido ou houver inconsistência com as observações, approved=false e descreva o que corrigir de forma específica e acionável.",
    ]
)


def observations_of(trace: list[TraceEvent]) -> str:
    observations = [
        event["content"] for event in trace if event["type"] == "observation"
    ]

    return "\n".join(observations) if observations else "(nenhuma)"


def enrich_input_with_feedback(original_input: str, round: int, feedback: str) -> str:
    body = "(sem feedback adicional)" if not feedback.strip() else feedback

    return f"[Critique - Round {round}]:\n{body}\n\nOriginal request:\n{original_input}"


def create_llm_critic(model_factory: ModelFactory) -> CriticFn:
    async def critic(
        answer: str, trace: list[TraceEvent], original_input: str
    ) -> CritiqueResult:
        try:
            raw = await structured(model_factory, CritiqueResult).ainvoke(
                [
                    ("system", CRITIC_PROMPT),
                    (
                        "user",
                        f"Pedido: {original_input}\nObservações: {observations_of(trace)}\nResposta: {answer}",
                    ),
                ]
            )

            return CritiqueResult.model_validate(raw)
        except Exception:
            return CritiqueResult(approved=True, feedback="")

    return critic


def critique_event_content(feedback: str) -> str:
    return "[Crítico aprovou sem feedback]" if not feedback.strip() else feedback


class ReflectionStrategy:
    def __init__(
        self,
        strategy: ReasoningStrategy,
        critic: CriticFn | None,
        max_reflections: int,
    ) -> None:
        self._strategy = strategy
        self._critic = critic
        self._max_reflections = 0 if critic is None else max_reflections

    @property
    def name(self) -> str:
        return f"reflect:{self._strategy.name}"

    async def run(self, input: str) -> StrategyResult:
        started_at = now_ms()
        current = await self._strategy.run(input)
        total_llm_calls = current["metrics"]["llm_calls"]
        critic_calls = 0
        trace = [*current["trace"]]

        for round in range(1, self._max_reflections + 1):
            if self._critic is None:
                break

            critique = await self._critic(current["answer"], current["trace"], input)
            critic_calls += 1
            trace.append(
                {
                    "type": "critique",
                    "content": critique_event_content(critique.feedback),
                    "round": round,
                    "approved": critique.approved,
                    "timestamp_ms": now_ms(),
                }
            )

            if critique.approved:
                break

            current = await self._strategy.run(
                enrich_input_with_feedback(input, round, critique.feedback)
            )
            total_llm_calls += current["metrics"]["llm_calls"]
            trace.extend(current["trace"])

        return {
            "answer": current["answer"],
            "trace": trace,
            "metrics": {
                "llm_calls": total_llm_calls + critic_calls,
                "latency_ms": now_ms() - started_at,
            },
        }


def with_reflection(
    strategy: ReasoningStrategy,
    max_reflections: int = 2,
    critic: CriticFn | None = None,
    model_factory: ModelFactory | None = None,
) -> ReasoningStrategy:
    if critic is None and max_reflections > 0 and model_factory is not None:
        critic = create_llm_critic(model_factory)

    return ReflectionStrategy(strategy, critic, max_reflections)
