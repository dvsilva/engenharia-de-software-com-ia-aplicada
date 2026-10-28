package graph;

import dev.langchain4j.data.message.ChatMessage;
import java.util.Map;
import org.bsc.langgraph4j.prebuilt.MessagesState;
import org.bsc.langgraph4j.state.Channel;

public final class GraphState extends MessagesState<ChatMessage> {
    public enum Command {
        UPPERCASE,
        LOWERCASE,
        UNKNOWN
    }

    public static final String OUTPUT = "output";
    public static final String COMMAND = "command";
    public static final Map<String, Channel<?>> SCHEMA = MessagesState.SCHEMA;

    public GraphState(Map<String, Object> data) {
        super(data);
    }

    public String output() {
        return this.<String>value(OUTPUT).orElse("");
    }

    public Command command() {
        return this.<Command>value(COMMAND).orElse(Command.UNKNOWN);
    }
}
