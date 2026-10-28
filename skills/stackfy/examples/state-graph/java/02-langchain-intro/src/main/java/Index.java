import java.net.InetSocketAddress;

public final class Index {
    private Index() {}

    public static void main(String[] args) throws Exception {
        var port = Integer.parseInt(System.getenv().getOrDefault("PORT", "3000"));
        var app = Server.createServer();

        app.bind(new InetSocketAddress("0.0.0.0", port), 0);
        app.start();

        System.out.println("server running at " + port);
    }
}
