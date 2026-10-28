from collections.abc import Awaitable
from typing import Annotated, NotRequired, Protocol, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    trendsData: NotRequired[str]
    question: NotRequired[str]
    keywords: NotRequired[list[str]]


class StateUpdate(TypedDict, total=False):
    messages: list[AnyMessage]
    trendsData: str
    question: str
    keywords: list[str]


class Node(Protocol):
    def __call__(self, state: GraphState) -> Awaitable[StateUpdate]: ...
