import os
from dataclasses import dataclass

from langchain_core.tools import BaseTool

from llm.factory import create_model
from store.in_memory_store import InMemoryStore
from store.seed import seed_store
from strategies.plan_execute import PlanExecuteStrategy
from strategies.react import ReactStrategy
from tools import create_tools

__all__ = ["OpsPilot", "PlanExecuteStrategy", "ReactStrategy", "bootstrap_ops_pilot"]


@dataclass(frozen=True)
class Strategies:
    react: ReactStrategy
    plan_and_execute: PlanExecuteStrategy


@dataclass(frozen=True)
class OpsPilot:
    store: InMemoryStore
    tools: list[BaseTool]
    strategies: Strategies


def bootstrap_ops_pilot() -> OpsPilot:
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise RuntimeError("OPENROUTER_API_KEY environment variable is required")

    store = InMemoryStore()
    seed_store(store)
    tools = create_tools(store)

    return OpsPilot(
        store=store,
        tools=tools,
        strategies=Strategies(
            react=ReactStrategy(create_model, tools, max_iterations=10),
            plan_and_execute=PlanExecuteStrategy(
                create_model, tools, max_iterations=10
            ),
        ),
    )
