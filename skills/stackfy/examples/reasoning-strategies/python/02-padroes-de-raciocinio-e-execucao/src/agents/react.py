from collections.abc import Callable, Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.errors import GraphRecursionError
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from pydantic import ValidationError

from domain.types import StrategyResult
from store.in_memory_store import now_ms
from tracing.builder import build_trace_from_messages

ModelFactory = Callable[[], ChatOpenAI]


def describe_tool_error(error: Exception) -> str:
    message = (
        "Received tool input did not match expected schema"
        if isinstance(error, ValidationError)
        else str(error)
    )

    return f"Error: {message}\n Please fix your mistakes."


def build_react_agent(
    model: ChatOpenAI, tools: Sequence[BaseTool]
) -> CompiledStateGraph[MessagesState]:
    bound = model.bind_tools(tools)

    async def agent(state: MessagesState) -> MessagesState:
        return {"messages": [await bound.ainvoke(state["messages"])]}

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent)
    graph.add_node("tools", ToolNode(tools, handle_tool_errors=describe_tool_error))
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "agent")

    return graph.compile()


def count_llm_calls(messages: Sequence[BaseMessage]) -> int:
    return sum(isinstance(message, AIMessage) for message in messages)


class ReactStrategy:
    name = "react"

    def __init__(
        self,
        model_factory: ModelFactory,
        tools: Sequence[BaseTool],
        max_iterations: int,
    ) -> None:
        self._model_factory = model_factory
        self._tools = tools
        self._max_iterations = max_iterations

    async def run(self, input: str) -> StrategyResult:
        started_at = now_ms()
        agent = build_react_agent(self._model_factory(), self._tools)

        try:
            result = await agent.ainvoke(
                {"messages": [HumanMessage(input)]},
                {"recursion_limit": max(3, self._max_iterations * 3)},
            )
        except GraphRecursionError:
            answer = f"[Iteration limit reached after {self._max_iterations} steps. Partial result unavailable.]"

            return {
                "answer": answer,
                "trace": [{"type": "answer", "content": answer}],
                "metrics": {"llm_calls": 0, "latency_ms": now_ms() - started_at},
            }

        trace = build_trace_from_messages(result["messages"])
        answers = [event["content"] for event in trace if event["type"] == "answer"]

        return {
            "answer": answers[-1] if answers else "No answer generated.",
            "trace": trace,
            "metrics": {
                "llm_calls": count_llm_calls(result["messages"]),
                "latency_ms": now_ms() - started_at,
            },
        }
