package graph.nodes;

import graph.GraphState;
import java.util.Locale;
import java.util.Map;

public final class UpperCaseNode {
    private UpperCaseNode() {}

    public static Map<String, Object> upperCaseNode(GraphState state) {
        return Map.of(GraphState.OUTPUT, state.output().toUpperCase(Locale.ROOT));
    }
}
