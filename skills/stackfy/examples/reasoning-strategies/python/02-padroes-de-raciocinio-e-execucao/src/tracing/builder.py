import json
from collections.abc import Sequence

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.messages.tool import ToolCall

from domain.types import TraceEvent

PLAN_EXECUTE_EVENTS = {"plan", "action", "observation", "critique", "answer"}


def compact_json(value: object) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def to_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(part_text(part) for part in content).strip()

    return "" if content is None else str(content)


def part_text(part: object) -> str:
    if isinstance(part, str):
        return part
    if isinstance(part, dict) and isinstance(part.get("text"), str):
        return str(part["text"])

    return compact_json(part)


def action_event(call: ToolCall) -> TraceEvent:
    return {
        "type": "action",
        "content": f"{call['name']}({compact_json(call['args'])})",
        "tool": call["name"],
        "tool_args": call["args"],
    }


def build_trace_from_messages(messages: Sequence[BaseMessage]) -> list[TraceEvent]:
    trace: list[TraceEvent] = []

    for message in messages:
        content = to_text(message.content).strip()

        if isinstance(message, AIMessage) and message.tool_calls:
            if content:
                trace.append({"type": "thought", "content": content})
            trace.extend(action_event(call) for call in message.tool_calls)
        elif isinstance(message, AIMessage) and content:
            trace.append({"type": "answer", "content": content})
        elif isinstance(message, ToolMessage):
            trace.append({"type": "observation", "content": content})

    if not any(event["type"] == "answer" for event in trace):
        trace.append({"type": "answer", "content": "No answer generated."})

    return trace


def build_plan_execute_trace(events: list[TraceEvent]) -> list[TraceEvent]:
    filtered = [event for event in events if event["type"] in PLAN_EXECUTE_EVENTS]

    if not filtered or filtered[-1]["type"] != "answer":
        filtered.append({"type": "answer", "content": "No final answer generated."})

    return filtered
