import sys

from graph.state import GraphState, Node, StateUpdate
from prompts.v1.identify_intent import (
    IntentData,
    get_system_prompt,
    get_user_prompt_template,
    intent_schema,
)
from services.appointment_service import professionals
from services.open_router_service import OpenRouterService


def create_identify_intent_node(
    llm_client: OpenRouterService,
) -> Node[IntentData | StateUpdate]:
    def identify_intent(state: GraphState) -> IntentData | StateUpdate:
        print("🔍 Identifying intent...")
        question = state["messages"][-1].text

        try:
            result = llm_client.generate_structured(
                get_system_prompt(professionals),
                get_user_prompt_template(question),
                intent_schema,
            )
            if not result.success:
                print(f"⚠️  Intent identification failed: {result.error}")
                return {"intent": "unknown", "error": result.error or ""}

            if result.data is None:
                raise ValueError("the model answered no intent")

            print(f"✅ Intent identified: {result.data['intent']}")
            return result.data
        except Exception as error:
            print("❌ Error in identifyIntent node:", error, file=sys.stderr)
            return {"intent": "unknown", "error": str(error)}

    return identify_intent
