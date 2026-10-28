import sys

from langchain_core.messages import AIMessage

from graph.state import GraphState, Node, StateUpdate
from prompts.v1.message_generator import (
    get_system_prompt,
    get_user_prompt_template,
    message_schema,
)
from services.open_router_service import OpenRouterService


def create_message_generator_node(
    llm_client: OpenRouterService,
) -> Node[StateUpdate]:
    def generate_message(state: GraphState) -> StateUpdate:
        print("💬 Generating response message...")

        try:
            has_succeeded = "success" if state.get("actionSuccess") else "error"
            scenario = f"{state.get('intent', 'unknown')}_{has_succeeded}"
            details = {
                "professionalName": state.get("professionalName"),
                "datetime": state.get("datetime"),
                "patientName": state.get("patientName"),
                "error": state.get("error"),
            }

            result = llm_client.generate_structured(
                get_system_prompt(),
                get_user_prompt_template(scenario, details),
                message_schema,
            )
            print(
                "✅ Message generated:",
                result.data["message"] if result.data else result,
            )

            if result.error:
                print(f"⚠️  Message generation failed: {result.error}")
                return {"messages": [AIMessage("Desculpe, errei!")]}

            if result.data is None:
                raise ValueError("the model answered no message")

            return {"messages": [AIMessage(result.data["message"])]}
        except Exception as error:
            print("❌ Error in messageGenerator node:", error, file=sys.stderr)
            return {
                "messages": [
                    AIMessage("An error occurred while processing your request.")
                ]
            }

    return generate_message
