package graph;

import static org.bsc.langgraph4j.StateGraph.END;
import static org.bsc.langgraph4j.StateGraph.START;
import static org.bsc.langgraph4j.action.AsyncEdgeAction.edge_async;
import static org.bsc.langgraph4j.action.AsyncNodeAction.node_async;

import graph.nodes.ChatResponseNode;
import graph.nodes.FallbackNode;
import graph.nodes.IdentifyIntentNode;
import graph.nodes.LowerCaseNode;
import graph.nodes.UpperCaseNode;
import java.util.Map;
import org.bsc.langgraph4j.CompiledGraph;
import org.bsc.langgraph4j.GraphStateException;
import org.bsc.langgraph4j.StateGraph;
import org.bsc.langgraph4j.langchain4j.serializer.std.LC4jStateSerializer;

public final class Graph {
    private Graph() {}

    private static String routeByCommand(GraphState state) {
        return switch (state.command()) {
            case UPPERCASE -> "uppercase";
            case LOWERCASE -> "lowercase";
            case UNKNOWN -> "fallback";
        };
    }

    public static CompiledGraph<GraphState> buildGraph() throws GraphStateException {
        return new StateGraph<>(GraphState.SCHEMA, new LC4jStateSerializer<>(GraphState::new))
                .addNode("identifyIntent", node_async(IdentifyIntentNode::identifyIntent))
                .addNode("chatResponse", node_async(ChatResponseNode::chatResponseNode))
                .addNode("uppercase", node_async(UpperCaseNode::upperCaseNode))
                .addNode("lowercase", node_async(LowerCaseNode::lowerCaseNode))
                .addNode("fallback", node_async(FallbackNode::fallbackNode))
                .addEdge(START, "identifyIntent")
                .addConditionalEdges(
                        "identifyIntent",
                        edge_async(Graph::routeByCommand),
                        Map.of(
                                "uppercase", "uppercase",
                                "lowercase", "lowercase",
                                "fallback", "fallback"))
                .addEdge("uppercase", "chatResponse")
                .addEdge("lowercase", "chatResponse")
                .addEdge("fallback", "chatResponse")
                .addEdge("chatResponse", END)
                .compile();
    }
}
