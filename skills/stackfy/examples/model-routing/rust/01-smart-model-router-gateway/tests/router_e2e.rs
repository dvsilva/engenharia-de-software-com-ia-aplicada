use serde_json::Value;
use smart_model_router_gateway::config::{config, ModelConfig};
use smart_model_router_gateway::openrouter_service::OpenRouterService;
use smart_model_router_gateway::server::create_server;

fn sorted_by(by: &str) -> ModelConfig {
    let mut custom_config = config();

    custom_config.provider.sort.by = by.into();
    custom_config
}

fn ask(by: &str) -> (u16, Value) {
    let app = create_server(OpenRouterService::new(sorted_by(by)));
    let response = app.inject(
        "POST",
        "/chat",
        Some("application/json"),
        r#"{"question":"What is rate limiting?"}"#,
    );

    (
        response.status,
        serde_json::from_str(&response.body).unwrap_or(Value::Null),
    )
}

#[test]
fn routes_to_cheapest_model_by_default() {
    let (status, body) = ask("price");

    assert_eq!(status, 200);
    assert_eq!(body["model"], "arcee-ai/trinity-large-preview:free");
}

#[test]
fn routes_to_highest_throughput_model_by_default() {
    let (status, body) = ask("throughput");

    assert_eq!(status, 200);
    assert_eq!(body["model"], "nvidia/nemotron-3-nano-30b-a3b:free");
}
