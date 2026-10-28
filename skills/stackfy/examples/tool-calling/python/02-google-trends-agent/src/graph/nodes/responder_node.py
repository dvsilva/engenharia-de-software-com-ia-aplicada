import sys

from langchain_core.messages import AIMessage

from graph.state import GraphState, Node, StateUpdate
from prompts.v1.video_trends import (
    get_responder_system_prompt,
    get_responder_user_prompt,
)
from services.open_router_service import OpenRouterService


def create_responder_node(
    open_router_service: OpenRouterService,
) -> Node:
    async def responder(state: GraphState) -> StateUpdate:
        print("💬 Responder processing...")

        try:
            data = await open_router_service.generate_structured(
                get_responder_system_prompt(),
                get_responder_user_prompt(
                    state.get("question", ""), state.get("trendsData", "")
                ),
            )

            return {"messages": [AIMessage(str(data))]}
        except Exception as error:
            print("Responder error:", error, file=sys.stderr)
            return {
                "messages": [
                    AIMessage(
                        "Sorry, something went wrong while generating the response."
                    )
                ]
            }

    return responder
