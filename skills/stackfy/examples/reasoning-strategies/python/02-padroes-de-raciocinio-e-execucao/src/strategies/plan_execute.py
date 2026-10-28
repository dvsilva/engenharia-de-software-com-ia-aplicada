import operator
from collections.abc import Sequence
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from agents.react import ModelFactory, build_react_agent, count_llm_calls
from domain.types import StrategyResult, TraceEvent
from store.in_memory_store import now_ms
from tracing.builder import action_event, to_text

MAX_STEPS = 8

Step = Annotated[str, Field(min_length=1)]
Progress = list[tuple[str, str]]


class Plan(BaseModel):
    steps: list[Step] = Field(
        min_length=1,
        max_length=MAX_STEPS,
        description="passos curtos, ordenados, executaveis com as ferramentas disponiveis",
    )


class Replan(BaseModel):
    decision: Literal["adjust", "continue", "finish"]
    steps: list[Step] | None = Field(
        default=None,
        max_length=MAX_STEPS,
        description="obrigatório quando decision=adjust",
    )
    answer: Step | None = Field(
        default=None, description="obrigatório quando decision=finish"
    )


class PlanExecuteState(TypedDict):
    input: str
    plan: list[str]
    done: Annotated[Progress, operator.add]
    answer: str
    trace: Annotated[list[TraceEvent], operator.add]
    iterations: int
    llm_calls: int


class StateUpdate(TypedDict, total=False):
    plan: list[str]
    done: Progress
    answer: str
    trace: list[TraceEvent]
    iterations: int
    llm_calls: int


def as_extract_function(schema: type[BaseModel]) -> dict[str, object]:
    return {"name": "extract", "parameters": schema.model_json_schema()}


def structured(
    model_factory: ModelFactory, schema: type[BaseModel]
) -> Runnable[list[tuple[str, str]], object]:
    return model_factory().with_structured_output(
        as_extract_function(schema), method="function_calling"
    )


def format_plan(steps: list[str]) -> str:
    return "\n".join(f"{index}. {step}" for index, step in enumerate(steps, start=1))


def done_as_text(done: Progress) -> str:
    if not done:
        return "none"

    return "\n".join(
        f"{index}. {step}\n   -> {result}"
        for index, (step, result) in enumerate(done, start=1)
    )


def build_executor_user_message(
    original_input: str, done: Progress, current_step: str
) -> str:
    sections = [
        f"Pedido original (contexto — cumpra as restrições literais):\n{original_input}",
        "Regras: preserve nomes de serviço exatamente como no pedido; sev1=critical, sev2=high, sev3=medium, sev4=low.",
    ]

    if done:
        sections.append(
            f"Progresso anterior (use IDs/dados já obtidos):\n{done_as_text(done)}"
        )
    sections.append(f"Passo atual a executar agora:\n{current_step}")

    return "\n\n".join(sections)


def extract_answer(messages: Sequence[BaseMessage]) -> str:
    for message in reversed(messages):
        if (
            isinstance(message, AIMessage)
            and isinstance(message.content, str)
            and message.content.strip()
        ):
            return message.content.strip()

    return "Step executed without textual summary."


def extract_action_observation_trace(
    messages: Sequence[BaseMessage],
) -> list[TraceEvent]:
    events: list[TraceEvent] = []

    for message in messages:
        if isinstance(message, AIMessage):
            events.extend(action_event(call) for call in message.tool_calls)
        elif isinstance(message, ToolMessage) and to_text(message.content).strip():
            events.append(
                {"type": "observation", "content": to_text(message.content).strip()}
            )

    return events


def planner_prompt(step_limit: int) -> str:
    return " ".join(
        [
            "Você é o planner operacional do OpsPilot.",
            f"Produza no máximo {step_limit} passos curtos, ordenados e executáveis com as tools disponíveis.",
            "Não invente ferramentas fora de list_alerts, open_incident, resolve_incident.",
            "Preserve literais do pedido (nomes de serviço, IDs, ordem).",
            "Se o pedido falar sev2/sev1/etc, nos passos deixe explícito severity=high/critical/... (sev1=critical, sev2=high, sev3=medium, sev4=low).",
            "Passos que dependem de dados anteriores devem dizer para reutilizar IDs/resultados do progresso.",
        ]
    )


REPLANNER_PROMPT = " ".join(
    [
        "Você é o replanner operacional do OpsPilot.",
        "Decida estritamente entre: adjust, continue, finish.",
        "Escolha finish quando o pedido original já puder ser respondido com o progresso (preencha answer).",
        "A answer de finish deve responder ao pedido original de forma completa (números, serviços, status) — não apenas listar passos.",
        "Escolha adjust quando o plano restante precisar de correção (preencha steps com literais preservados).",
        "Escolha continue quando o plano atual ainda estiver válido.",
    ]
)


def finish_from_done(state: PlanExecuteState, prefix: str | None = None) -> str:
    if state["done"]:
        body = done_as_text(state["done"])

        return (
            f"{prefix}\n{body}"
            if prefix
            else f"Execução concluída com {len(state['done'])} passo(s):\n{body}"
        )

    return prefix or "Nenhum passo executado."


def finished(answer: str, llm_calls: int | None = None) -> StateUpdate:
    update: StateUpdate = {
        "answer": answer,
        "trace": [{"type": "answer", "content": answer}],
    }

    if llm_calls is not None:
        update["llm_calls"] = llm_calls

    return update


class PlanExecuteStrategy:
    name = "plan-and-execute"

    def __init__(
        self,
        model_factory: ModelFactory,
        tools: Sequence[BaseTool],
        max_iterations: int,
        enable_replanner: bool = True,
    ) -> None:
        self._model_factory = model_factory
        self._tools = tools
        self._max_iterations = max_iterations
        self._enable_replanner = enable_replanner

    async def run(self, input: str) -> StrategyResult:
        started_at = now_ms()
        step_limit = min(MAX_STEPS, self._max_iterations)
        planner_model = structured(self._model_factory, Plan)
        replanner_model = structured(self._model_factory, Replan)

        async def planner(state: PlanExecuteState) -> StateUpdate:
            try:
                raw = await planner_model.ainvoke(
                    [("system", planner_prompt(step_limit)), ("user", state["input"])]
                )
                steps = Plan.model_validate(raw).steps[:step_limit]
            except Exception:
                steps = [f"Execute o pedido com as tools disponíveis: {state['input']}"]

            return {
                "plan": steps,
                "trace": [{"type": "plan", "content": format_plan(steps)}],
                "llm_calls": state["llm_calls"] + 1,
            }

        async def executor(state: PlanExecuteState) -> StateUpdate:
            if not state["plan"] or state["iterations"] >= step_limit:
                return {}

            current_step, *remaining_plan = state["plan"]
            agent = build_react_agent(self._model_factory(), self._tools)
            result = await agent.ainvoke(
                {
                    "messages": [
                        HumanMessage(
                            build_executor_user_message(
                                state["input"], state["done"], current_step
                            )
                        )
                    ]
                },
                {"recursion_limit": max(3, step_limit * 3)},
            )
            messages = result["messages"]

            return {
                "plan": remaining_plan,
                "done": [(current_step, extract_answer(messages))],
                "trace": extract_action_observation_trace(messages),
                "iterations": state["iterations"] + 1,
                "llm_calls": state["llm_calls"] + count_llm_calls(messages),
            }

        async def replanner(state: PlanExecuteState) -> StateUpdate:
            if state["iterations"] >= step_limit:
                return finished(
                    finish_from_done(
                        state, f"Limite de {step_limit} passos atingido. Progresso:"
                    )
                )

            llm_calls = state["llm_calls"] + 1

            try:
                raw = await replanner_model.ainvoke(
                    [
                        ("system", REPLANNER_PROMPT),
                        (
                            "user",
                            "\n\n".join(
                                [
                                    f"Pedido original: {state['input']}",
                                    f"Passos concluídos ({len(state['done'])}):\n{done_as_text(state['done'])}",
                                    f"Plano restante ({len(state['plan'])}):\n{format_plan(state['plan']) or 'nenhum'}",
                                ]
                            ),
                        ),
                    ]
                )
                decision = Replan.model_validate(raw)
            except Exception:
                return finished(finish_from_done(state), llm_calls)

            if decision.decision == "finish":
                answer = (decision.answer or "").strip() or finish_from_done(state)

                return finished(answer, llm_calls)

            if decision.decision == "adjust":
                remaining_budget = step_limit - state["iterations"]
                revised_plan = [
                    step for step in decision.steps or [] if step.strip()
                ][:remaining_budget]

                if not revised_plan:
                    return finished(finish_from_done(state), llm_calls)

                return {
                    "plan": revised_plan,
                    "trace": [{"type": "critique", "content": format_plan(revised_plan)}],
                    "llm_calls": llm_calls,
                }

            if not state["plan"]:
                return finished(finish_from_done(state), llm_calls)

            return {
                "trace": [
                    {
                        "type": "critique",
                        "content": "Plano atual segue válido; continuar execução.",
                    }
                ],
                "llm_calls": llm_calls,
            }

        async def finish_without_replanner(state: PlanExecuteState) -> StateUpdate:
            return finished(finish_from_done(state))

        def after_replanner(state: PlanExecuteState) -> str:
            if state["answer"] or state["iterations"] >= step_limit:
                return END

            return "executor"

        def after_executor(state: PlanExecuteState) -> str:
            if not state["plan"] or state["iterations"] >= step_limit:
                return "finish"

            return "executor"

        graph = StateGraph(PlanExecuteState)
        graph.add_node("planner", planner)
        graph.add_node("executor", executor)
        graph.add_edge(START, "planner")
        graph.add_edge("planner", "executor")

        if self._enable_replanner:
            graph.add_node("replanner", replanner)
            graph.add_edge("executor", "replanner")
            graph.add_conditional_edges("replanner", after_replanner)
        else:
            graph.add_node("finish", finish_without_replanner)
            graph.add_conditional_edges("executor", after_executor)
            graph.add_edge("finish", END)

        initial: PlanExecuteState = {
            "input": input,
            "plan": [],
            "done": [],
            "answer": "",
            "trace": [],
            "iterations": 0,
            "llm_calls": 0,
        }
        result = await graph.compile().ainvoke(
            initial, {"recursion_limit": max(10, step_limit * 5)}
        )

        trace: list[TraceEvent] = result["trace"] or [
            {"type": "answer", "content": "No answer generated."}
        ]
        answers = [event["content"] for event in trace if event["type"] == "answer"]

        return {
            "answer": result["answer"] or (answers[-1] if answers else "")
            or "No answer generated.",
            "trace": trace,
            "metrics": {
                "llm_calls": result["llm_calls"],
                "latency_ms": now_ms() - started_at,
            },
        }
