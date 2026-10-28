package graph.nodes;

import dev.langchain4j.data.message.AiMessage;
import graph.GraphState;
import java.util.Map;

public final class ChatResponseNode {
    private ChatResponseNode() {}

    public static Map<String, Object> chatResponseNode(GraphState state) {
        return Map.of(GraphState.MESSAGES_STATE, AiMessage.from(state.output()));
    }
}
