use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct ProviderSort {
    pub by: String,
    pub partition: String,
}

#[derive(Clone, Serialize)]
pub struct Provider {
    pub sort: ProviderSort,
}

#[derive(Clone)]
pub struct ModelConfig {
    pub api_key: String,
    pub http_referer: String,
    pub x_title: String,
    pub port: u16,
    pub models: Vec<String>,
    pub temperature: f64,
    pub max_tokens: u32,
    pub system_prompt: String,
    pub provider: Provider,
}

pub fn config() -> ModelConfig {
    let api_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_default();

    if api_key.is_empty() {
        eprintln!("Assertion failed: OPENROUTER_API_KEY is not set in env variables");
    }

    ModelConfig {
        api_key,
        http_referer: "http://pos-ia.com".into(),
        x_title: "SmartModelRouterGateway".into(),
        port: 3000,
        models: vec![
            // top 4 para a listagem ordenada por preço
            "arcee-ai/trinity-large-preview:free".into(),
            // top 3 para listagem de throughput
            "nvidia/nemotron-3-nano-30b-a3b:free".into(),
        ],
        temperature: 0.2,
        max_tokens: 100,
        system_prompt: "You are a helpful assistant.".into(),
        provider: Provider {
            sort: ProviderSort {
                by: "throughput".into(),
                // by: "latency",
                // by: "price",
                partition: "none".into(),
            },
        },
    }
}
