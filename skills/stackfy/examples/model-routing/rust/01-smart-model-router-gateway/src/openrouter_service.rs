use crate::config::ModelConfig;
use reqwest::blocking::Client;
use serde::Serialize;
use serde_json::{json, Value};

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Serialize)]
pub struct LlmResponse {
    pub model: String,
    pub content: String,
}

pub struct OpenRouterService {
    client: Client,
    config: ModelConfig,
    base_url: String,
}

fn base_url() -> String {
    std::env::var("OPENAI_BASE_URL")
        .ok()
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| OPENROUTER_URL.into())
        .trim_end_matches('/')
        .into()
}

fn text_of(value: &Value) -> String {
    value.as_str().unwrap_or_default().into()
}

impl OpenRouterService {
    pub fn new(config: ModelConfig) -> Self {
        Self {
            client: Client::new(),
            config,
            base_url: base_url(),
        }
    }

    pub fn generate(&self, prompt: &str) -> Result<LlmResponse, reqwest::Error> {
        let request = json!({
            "models": self.config.models,
            "messages": [
                { "role": "system", "content": self.config.system_prompt },
                { "role": "user", "content": prompt },
            ],
            "stream": false,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "provider": self.config.provider,
        });
        let response: Value = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .bearer_auth(&self.config.api_key)
            .header("HTTP-Referer", &self.config.http_referer)
            .header("X-Title", &self.config.x_title)
            .json(&request)
            .send()?
            .error_for_status()?
            .json()?;

        Ok(LlmResponse {
            model: text_of(&response["model"]),
            content: text_of(&response["choices"][0]["message"]["content"]),
        })
    }
}
