use crate::config::ModelConfig;
use reqwest::blocking::Client;
use serde_json::{Value, json};

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1";

pub type StructuredResult = Result<Option<Value>, String>;

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

fn fits_schema(value: &Value, schema: &Value) -> bool {
    match schema["type"].as_str() {
        Some("object") => {
            let Some(fields) = value.as_object() else {
                return false;
            };
            let required = schema["required"].as_array().into_iter().flatten();
            let closed = schema["additionalProperties"] == Value::Bool(false);

            required
                .filter_map(Value::as_str)
                .all(|name| fields.contains_key(name))
                && fields
                    .iter()
                    .all(|(name, field)| match schema["properties"].get(name) {
                        Some(property) => fits_schema(field, property),
                        None => !closed,
                    })
        }
        Some("array") => value
            .as_array()
            .is_some_and(|items| items.iter().all(|item| fits_schema(item, &schema["items"]))),
        Some("string") => value.is_string(),
        Some("number") => value.is_number(),
        Some("boolean") => value.is_boolean(),
        _ => true,
    }
}

fn error_message(status: reqwest::StatusCode, body: &str) -> String {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|error| error["error"]["message"].as_str().map(String::from))
        .unwrap_or_else(|| body.into());

    format!("{} {message}", status.as_u16())
}

impl OpenRouterService {
    pub fn new(config: ModelConfig) -> Self {
        Self {
            client: Client::new(),
            config,
            base_url: base_url(),
        }
    }

    fn complete(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        schema: &Value,
    ) -> Result<Value, String> {
        let request = json!({
            "model": self.config.models[0],
            "temperature": self.config.temperature,
            "stream": false,
            "models": self.config.models,
            "provider": self.config.provider,
            "response_format": {
                "type": "json_schema",
                "json_schema": { "name": "extract", "schema": schema, "strict": true },
            },
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt },
            ],
        });
        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .bearer_auth(&self.config.api_key)
            .header("HTTP-Referer", &self.config.http_referer)
            .header("X-Title", &self.config.x_title)
            .json(&request)
            .send()
            .map_err(|error| error.to_string())?;
        let status = response.status();
        let body = response.text().map_err(|error| error.to_string())?;

        if !status.is_success() {
            return Err(error_message(status, &body));
        }

        serde_json::from_str(&body).map_err(|error| error.to_string())
    }

    pub fn generate_structured(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        schema: &Value,
    ) -> StructuredResult {
        let completion = self
            .complete(system_prompt, user_prompt, schema)
            .inspect_err(|error| eprintln!("🔴 LLM Error: {error}"))?;
        let structured = completion["choices"][0]["message"]["content"]
            .as_str()
            .and_then(|content| serde_json::from_str::<Value>(content).ok())
            .filter(|data| fits_schema(data, schema));

        Ok(structured)
    }
}
