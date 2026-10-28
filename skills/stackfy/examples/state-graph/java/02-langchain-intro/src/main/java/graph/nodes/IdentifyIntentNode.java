package graph.nodes;

import dev.langchain4j.data.message.UserMessage;
import graph.GraphState;
import graph.GraphState.Command;
import java.util.Locale;
import java.util.Map;

public final class IdentifyIntentNode {
    private IdentifyIntentNode() {}

    private static Command commandOf(String input) {
        var inputLower = input.toLowerCase(Locale.ROOT);

        if (inputLower.contains("upper")) return Command.UPPERCASE;
        if (inputLower.contains("lower")) return Command.LOWERCASE;
        return Command.UNKNOWN;
    }

    public static Map<String, Object> identifyIntent(GraphState state) {
        var input = state.lastMessage()
                .map(message -> message instanceof UserMessage user ? user.singleText() : "")
                .orElse("");

        return Map.of(GraphState.COMMAND, commandOf(input), GraphState.OUTPUT, input);
    }
}
