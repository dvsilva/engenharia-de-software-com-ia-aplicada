use super::mcp_service::{McpTools, get_mcp_tools};
use crate::config::ModelConfig;
use crate::prompt_template;
use reqwest::Client;
use serde_json::{Value, json};
use std::error::Error;

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1";

const RECURSION_LIMIT: usize = 25;

#[derive(Clone)]
pub struct GuardrailResult {
    pub safe: bool,
    pub reason: Option<String>,
    pub analysis: Option<String>,
}

pub struct OpenRouterService {
    client: Client,
    config: ModelConfig,
    base_url: String,
    fs_agent: Option<McpTools>,
}

fn base_url() -> String {
    std::env::var("OPENAI_BASE_URL")
        .ok()
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| OPENROUTER_URL.into())
        .trim_end_matches('/')
        .into()
}

fn error_message(status: reqwest::StatusCode, body: &str) -> String {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|error| error["error"]["message"].as_str().map(String::from))
        .unwrap_or_else(|| body.into());

    format!("{} {message}", status.as_u16())
}

fn function_definitions(agent: &McpTools) -> Vec<Value> {
    agent
        .tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description.as_deref().unwrap_or_default(),
                    "parameters": tool.input_schema.as_ref(),
                },
            })
        })
        .collect()
}

fn echoed_calls(calls: &[Value]) -> Vec<Value> {
    calls
        .iter()
        .map(|call| json!({ "id": call["id"], "type": "function", "function": call["function"] }))
        .collect()
}

fn text_of(message: &Value) -> String {
    message["content"].as_str().unwrap_or_default().into()
}

impl OpenRouterService {
    pub fn new(config: ModelConfig) -> Self {
        Self {
            client: Client::new(),
            config,
            base_url: base_url(),
            fs_agent: None,
        }
    }

    async fn complete(
        &self,
        model: &str,
        messages: &[Value],
        tools: &[Value],
    ) -> Result<Value, Box<dyn Error>> {
        let mut request = json!({
            "model": model,
            "temperature": self.config.temperature,
            "stream": false,
            "models": self.config.models,
            "provider": self.config.provider,
            "max_tokens": self.config.max_tokens,
            "messages": messages,
        });
        if !tools.is_empty() {
            request["tools"] = json!(tools);
        }

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .bearer_auth(&self.config.api_key)
            .header("HTTP-Referer", &self.config.http_referer)
            .header("X-Title", &self.config.x_title)
            .json(&request)
            .send()
            .await?;
        let status = response.status();
        let body = response.text().await?;

        if !status.is_success() {
            return Err(error_message(status, &body).into());
        }

        let completion: Value = serde_json::from_str(&body)?;

        Ok(completion["choices"][0]["message"].clone())
    }

    pub async fn generate(
        &mut self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<String, Box<dyn Error>> {
        if self.fs_agent.is_none() {
            self.fs_agent = Some(get_mcp_tools().await?);
        }

        let Some(agent) = &self.fs_agent else {
            unreachable!("the agent was just created");
        };
        let tools = function_definitions(agent);
        let mut messages = vec![
            json!({ "role": "system", "content": system_prompt }),
            json!({ "role": "user", "content": user_prompt }),
        ];

        let mut steps = 0;

        loop {
            steps += 1;
            let message = self
                .complete(&self.config.models[0], &messages, &tools)
                .await?;
            let calls = message["tool_calls"]
                .as_array()
                .cloned()
                .unwrap_or_default();

            if calls.is_empty() {
                return Ok(text_of(&message));
            }

            steps += 1;
            if steps > RECURSION_LIMIT {
                return Err(format!(
                    "Recursion limit of {RECURSION_LIMIT} reached without hitting a stop condition."
                )
                .into());
            }

            messages.push(json!({
                "role": "assistant",
                "content": text_of(&message),
                "tool_calls": echoed_calls(&calls),
            }));
            for call in &calls {
                let name = call["function"]["name"].as_str().unwrap_or_default();
                let arguments = call["function"]["arguments"].as_str().unwrap_or("{}");

                messages.push(json!({
                    "role": "tool",
                    "content": agent.call(name, arguments).await,
                    "tool_call_id": call["id"],
                }));
            }
        }
    }

    pub async fn check_guard_rails(
        &self,
        guardrails_prompt: &str,
        user_input: &str,
        enabled: bool,
    ) -> Result<GuardrailResult, Box<dyn Error>> {
        if !enabled {
            return Ok(GuardrailResult {
                safe: true,
                reason: Some("Guardrails disabled".into()),
                analysis: None,
            });
        }

        let input = prompt_template::format(guardrails_prompt, &[("USER_INPUT", user_input)]);
        let message = self
            .complete(
                &self.config.guardrails_model,
                &[json!({ "role": "user", "content": input })],
                &[],
            )
            .await?;
        let result = text_of(&message).trim().to_owned();

        if result.to_uppercase().starts_with("UNSAFE") {
            return Ok(GuardrailResult {
                safe: false,
                reason: Some("Prompt Injection detected by safeguard model".into()),
                analysis: Some(result),
            });
        }

        Ok(GuardrailResult {
            safe: true,
            reason: None,
            analysis: Some(result),
        })
    }

    pub async fn close(self) {
        if let Some(agent) = self.fs_agent {
            agent.close().await;
        }
    }
}
