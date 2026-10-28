import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RouterE2ETest {
    private static final ObjectMapper JSON = new ObjectMapper();

    private static HttpResponse<String> chat(String question) throws Exception {
        var app = Server.createServer();

        app.bind(new InetSocketAddress("127.0.0.1", 0), 0);
        app.start();

        try (var client = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(
                            URI.create("http://127.0.0.1:" + app.getAddress().getPort() + "/chat"))
                    .header("content-type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            JSON.writeValueAsString(Map.of("question", question))))
                    .build();

            return client.send(request, HttpResponse.BodyHandlers.ofString());
        } finally {
            app.stop(0);
        }
    }

    @Test
    @DisplayName("command upper transforms message into UPPERCASE")
    void upper() throws Exception {
        var message = "make THis message UPPER please!";
        var expected = message.toUpperCase(Locale.ROOT);
        var response = chat(message);

        assertEquals(200, response.statusCode());
        assertEquals(expected, response.body());
    }

    @Test
    @DisplayName("command upper transforms message into LOWERCASE")
    void lower() throws Exception {
        var message = "MAKE THIS MESSAGE LOWER PLEASE!";
        var expected = message.toLowerCase(Locale.ROOT);
        var response = chat(message);

        assertEquals(200, response.statusCode());
        assertEquals(expected, response.body());
    }

    @Test
    @DisplayName("command upper transforms message into UNKNOWN")
    void unknown() throws Exception {
        var message = "HEY THERE!";
        var expected = "Unknown command. Try 'make this uppercase' or 'convert to lowercase'";
        var response = chat(message);

        assertEquals(200, response.statusCode());
        assertEquals(expected, response.body());
    }
}
