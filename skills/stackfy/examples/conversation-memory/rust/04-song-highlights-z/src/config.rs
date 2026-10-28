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
    pub provider: Provider,
    pub models: Vec<String>,
    pub temperature: f64,
    pub memory_db_uri: String,
    pub max_messages_to_summary: usize,
}

pub fn config() -> ModelConfig {
    let api_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_default();

    if api_key.is_empty() {
        eprintln!("Assertion failed: OPENROUTER_API_KEY is not set in environment variables");
    }

    ModelConfig {
        api_key,
        http_referer: String::new(),
        x_title: "IA Devs - Prompt Chaining Article Generator".into(),
        models: vec!["arcee-ai/trinity-large-preview:free".into()],
        provider: Provider {
            sort: ProviderSort {
                by: "throughput".into(),
                partition: "none".into(),
            },
        },
        temperature: 0.7,
        memory_db_uri: "postgresql://postgres:mysecretpassword@localhost:5432/song_recommender"
            .into(),
        max_messages_to_summary: 2,
    }
}
