import unittest

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from tracing.builder import build_plan_execute_trace, build_trace_from_messages


class BuildTraceFromMessagesTest(unittest.TestCase):
    def test_creates_thought_action_observation_answer_sequence(self) -> None:
        trace = build_trace_from_messages(
            [
                HumanMessage("Quais alertas estão ativos?"),
                AIMessage(
                    content="Vou consultar os alertas ativos.",
                    tool_calls=[
                        {"id": "call_1", "name": "list_alerts", "args": {"status": "firing"}}
                    ],
                ),
                ToolMessage(tool_call_id="call_1", content="Found 3 firing alert(s): ..."),
                AIMessage(content="Há três serviços com alertas ativos."),
            ]
        )

        self.assertEqual(
            [event["type"] for event in trace],
            ["thought", "action", "observation", "answer"],
        )
        self.assertEqual(trace[1].get("tool"), "list_alerts")
        self.assertEqual(trace[1].get("tool_args"), {"status": "firing"})

    def test_keeps_action_tool_and_args(self) -> None:
        trace = build_trace_from_messages(
            [
                AIMessage(
                    content="Vou abrir um incidente.",
                    tool_calls=[
                        {
                            "id": "call_open",
                            "name": "open_incident",
                            "args": {
                                "title": "Alta taxa",
                                "service": "payment-api",
                                "severity": "critical",
                            },
                        }
                    ],
                ),
                ToolMessage(
                    tool_call_id="call_open",
                    content="Incident created successfully. ID: inc-1",
                ),
                AIMessage(content="Incidente criado."),
            ]
        )

        action = next(event for event in trace if event["type"] == "action")

        self.assertEqual(action.get("tool"), "open_incident")
        self.assertEqual(
            action.get("tool_args"),
            {"title": "Alta taxa", "service": "payment-api", "severity": "critical"},
        )


class BuildPlanExecuteTraceTest(unittest.TestCase):
    def test_supports_baseline_plan_action_observation_answer(self) -> None:
        trace = build_plan_execute_trace(
            [
                {"type": "plan", "content": "1. List alerts"},
                {
                    "type": "action",
                    "content": "list_alerts",
                    "tool": "list_alerts",
                    "tool_args": {"status": "firing"},
                },
                {"type": "observation", "content": "Found 3 firing alert(s)"},
                {
                    "type": "answer",
                    "content": "Serviços com alertas: payment-api, auth-service, order-service",
                },
            ]
        )

        self.assertEqual(
            [event["type"] for event in trace],
            ["plan", "action", "observation", "answer"],
        )

    def test_supports_replanning_with_critique(self) -> None:
        trace = build_plan_execute_trace(
            [
                {"type": "plan", "content": "1. Check alerts"},
                {
                    "type": "action",
                    "content": "list_alerts",
                    "tool": "list_alerts",
                    "tool_args": {"status": "firing"},
                },
                {"type": "observation", "content": "Found 3 firing alert(s)"},
                {"type": "critique", "content": "1. Open incident for payment-api"},
                {
                    "type": "action",
                    "content": "open_incident",
                    "tool": "open_incident",
                    "tool_args": {"service": "payment-api"},
                },
                {"type": "observation", "content": "Incident created"},
                {"type": "answer", "content": "Incidente aberto com sucesso."},
            ]
        )

        self.assertEqual(
            [event["type"] for event in trace],
            ["plan", "action", "observation", "critique", "action", "observation", "answer"],
        )
        for event in trace:
            if event["type"] == "action":
                self.assertTrue(event.get("tool"))
                self.assertTrue(event.get("tool_args"))
