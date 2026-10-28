package graph.nodes;

import graph.GraphState;
import java.util.Map;

public final class FallbackNode {
    private static final String MESSAGE =
            "Unknown command. Try 'make this uppercase' or 'convert to lowercase'";

    private FallbackNode() {}

    public static Map<String, Object> fallbackNode(GraphState state) {
        return Map.of(GraphState.OUTPUT, MESSAGE);
    }
}
