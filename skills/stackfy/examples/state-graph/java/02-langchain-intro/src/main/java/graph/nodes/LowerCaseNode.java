package graph.nodes;

import graph.GraphState;
import java.util.Locale;
import java.util.Map;

public final class LowerCaseNode {
    private LowerCaseNode() {}

    public static Map<String, Object> lowerCaseNode(GraphState state) {
        return Map.of(GraphState.OUTPUT, state.output().toLowerCase(Locale.ROOT));
    }
}
