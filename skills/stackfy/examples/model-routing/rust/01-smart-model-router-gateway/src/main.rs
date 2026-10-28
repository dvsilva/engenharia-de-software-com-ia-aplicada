use smart_model_router_gateway::config::config;
use smart_model_router_gateway::openrouter_service::OpenRouterService;
use smart_model_router_gateway::server::create_server;

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config = config();
    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(config.port);
    let app = create_server(OpenRouterService::new(config));
    let server = app.bind(port)?;

    println!("server running at {port}");
    app.serve(server);

    Ok(())
}
