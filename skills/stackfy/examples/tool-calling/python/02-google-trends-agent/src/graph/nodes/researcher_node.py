import json
import sys

from graph.state import GraphState, Node, StateUpdate
from prompts.v1.keywords import get_keywords_system_prompt
from services.open_router_service import OpenRouterService


def create_researcher_node(
    open_router_service: OpenRouterService,
) -> Node:
    async def researcher(state: GraphState) -> StateUpdate:
        print("🔍 Researcher processing...")
        user_question = str(state["messages"][-1].content)

        try:
            data = await open_router_service.generate_structured(
                get_keywords_system_prompt(),
                user_question,
            )

            print("📊 Trends data fetched via tool call")

            return {
                "trendsData": json.dumps(data, indent=2, ensure_ascii=False),
                "question": user_question,
            }
        except Exception as error:
            print("Researcher error:", error, file=sys.stderr)
            return {
                "trendsData": "Sorry, something went wrong while fetching trends data.",
                "question": user_question,
            }

    return researcher
