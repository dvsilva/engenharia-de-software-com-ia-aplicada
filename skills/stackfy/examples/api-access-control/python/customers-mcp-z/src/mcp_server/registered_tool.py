from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from mcp import types

ToolHandler = Callable[[dict[str, Any]], Awaitable[types.CallToolResult]]


@dataclass(frozen=True)
class RegisteredTool:
    definition: types.Tool
    handle: ToolHandler


def answered(text: str, structured: Any) -> types.CallToolResult:
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=text)],
        structured_content=structured,
    )


def failed(action: str, error: Exception) -> types.CallToolResult:
    message = f"Failed to {action}. Error: {error}"
    return answered(message, {"isError": True, "message": message})


def message_of(result: dict[str, Any]) -> str:
    message = result.get("message")
    return "" if message is None else str(message)
