import com.fasterxml.jackson.core.JacksonException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.TextNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import dev.langchain4j.data.message.UserMessage;
import graph.Graph;
import graph.GraphState;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.bsc.langgraph4j.CompiledGraph;
import org.bsc.langgraph4j.GraphStateException;

public final class Server {
    private record Reply(int status, String contentType, String body) {}

    private sealed interface ParsedBody {
        record Accepted(JsonNode body) implements ParsedBody {}

        record Rejected(Reply reply) implements ParsedBody {}
    }

    private static final int QUESTION_MIN_LENGTH = 5;
    private static final String JSON_TYPE = "application/json; charset=utf-8";
    private static final String TEXT_TYPE = "text/plain; charset=utf-8";
    private static final ObjectMapper JSON =
            new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private Server() {}

    private static Reply jsonReply(int status, Map<String, Object> body) {
        try {
            return new Reply(status, JSON_TYPE, JSON.writeValueAsString(body));
        } catch (JacksonException error) {
            throw new IllegalStateException(error);
        }
    }

    private static Reply errorReply(int status, String code, String error, String message) {
        var body = new LinkedHashMap<String, Object>();

        body.put("statusCode", status);
        body.put("code", code);
        body.put("error", error);
        body.put("message", message);

        return jsonReply(status, body);
    }

    private static Reply validationError(String message) {
        return errorReply(400, "FST_ERR_VALIDATION", "Bad Request", message);
    }

    private static Reply routeNotFound(String method, String url) {
        var body = new LinkedHashMap<String, Object>();

        body.put("message", "Route " + method + ":" + url + " not found");
        body.put("error", "Not Found");
        body.put("statusCode", 404);

        return jsonReply(404, body);
    }

    private static String mediaType(String contentType) {
        return contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
    }

    private static ParsedBody parseJson(String body) {
        if (body.isEmpty())
            return new ParsedBody.Rejected(errorReply(
                    400,
                    "FST_ERR_CTP_EMPTY_JSON_BODY",
                    "Bad Request",
                    "Body cannot be empty when content-type is set to 'application/json'"));

        try {
            return new ParsedBody.Accepted(JSON.readTree(body));
        } catch (JacksonException error) {
            return new ParsedBody.Rejected(errorReply(
                    400,
                    "FST_ERR_CTP_INVALID_JSON_BODY",
                    "Bad Request",
                    "Body is not valid JSON but content-type is set to 'application/json'"));
        }
    }

    private static ParsedBody parseBody(String contentType, String body) {
        if (contentType == null)
            return body.isEmpty()
                    ? new ParsedBody.Accepted(null)
                    : new ParsedBody.Rejected(errorReply(
                            415,
                            "FST_ERR_CTP_INVALID_MEDIA_TYPE",
                            "Unsupported Media Type",
                            "Unsupported Media Type: undefined"));

        return switch (mediaType(contentType)) {
            case "application/json" -> parseJson(body);
            case "text/plain" -> new ParsedBody.Accepted(new TextNode(body));
            default -> new ParsedBody.Rejected(errorReply(
                    415,
                    "FST_ERR_CTP_INVALID_MEDIA_TYPE",
                    "Unsupported Media Type",
                    "Unsupported Media Type: " + contentType));
        };
    }

    private static Optional<Reply> validate(JsonNode body) {
        if (body == null || !body.isObject()) return Optional.of(validationError("body must be object"));

        var question = body.get("question");

        if (question == null)
            return Optional.of(validationError("body must have required property 'question'"));
        if (!question.isTextual()) return Optional.of(validationError("body/question must be string"));

        var text = question.textValue();

        if (text.codePointCount(0, text.length()) < QUESTION_MIN_LENGTH)
            return Optional.of(validationError(
                    "body/question must NOT have fewer than " + QUESTION_MIN_LENGTH + " characters"));

        return Optional.empty();
    }

    private static Reply chat(CompiledGraph<GraphState> graph, String question) {
        try {
            var response = graph.invoke(Map.of(GraphState.MESSAGES_STATE, List.of(UserMessage.from(question))))
                    .orElseThrow();

            return new Reply(200, TEXT_TYPE, response.output());
        } catch (RuntimeException error) {
            System.err.println("Error handling /chat request: " + error);

            return new Reply(500, TEXT_TYPE, "");
        }
    }

    private static Reply answerChat(CompiledGraph<GraphState> graph, String contentType, String body) {
        return switch (parseBody(contentType, body)) {
            case ParsedBody.Rejected rejected -> rejected.reply();
            case ParsedBody.Accepted accepted -> validate(accepted.body())
                    .orElseGet(() -> chat(graph, accepted.body().get("question").textValue()));
        };
    }

    private static void send(HttpExchange exchange, Reply reply) throws IOException {
        var bytes = reply.body().getBytes(StandardCharsets.UTF_8);

        exchange.getResponseHeaders().set("content-type", reply.contentType());
        exchange.sendResponseHeaders(reply.status(), bytes.length == 0 ? -1 : bytes.length);

        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static void handle(CompiledGraph<GraphState> graph, HttpExchange exchange) throws IOException {
        var method = exchange.getRequestMethod();
        var uri = exchange.getRequestURI();
        var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);

        if (!method.equals("POST") || !uri.getRawPath().equals("/chat")) {
            send(exchange, routeNotFound(method, uri.toString()));
            return;
        }

        send(exchange, answerChat(graph, exchange.getRequestHeaders().getFirst("content-type"), body));
    }

    public static HttpServer createServer() throws IOException, GraphStateException {
        var graph = Graph.buildGraph();
        var server = HttpServer.create();

        server.createContext("/", exchange -> handle(graph, exchange));

        return server;
    }
}
