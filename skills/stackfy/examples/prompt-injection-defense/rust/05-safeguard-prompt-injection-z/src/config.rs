use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::error::Error;
use std::fs;

const USERS_PATH: &str = "data/users.json";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub username: String,
    pub role: String,
    pub permissions: Vec<String>,
    pub display_name: String,
}

pub type Users = HashMap<String, User>;

pub struct Prompts {
    pub blocked: String,
    pub system: String,
    pub guardrails: String,
}

#[derive(Clone, Serialize)]
pub struct ProviderSort {
    pub by: String,
    pub partition: String,
}

#[derive(Clone, Serialize)]
pub struct Provider {
    pub sort: ProviderSort,
}

pub struct ModelConfig {
    pub api_key: String,
    pub http_referer: String,
    pub x_title: String,
    pub provider: Provider,
    pub models: Vec<String>,
    pub temperature: f64,
    pub max_tokens: u32,
    pub guardrails_model: String,
}

pub fn users() -> Result<Users, Box<dyn Error>> {
    let text = fs::read_to_string(USERS_PATH)?;

    Ok(serde_json::from_str(&text)?)
}

pub fn prompts() -> Result<Prompts, Box<dyn Error>> {
    Ok(Prompts {
        blocked: fs::read_to_string("./prompts/blocked.txt")?,
        system: fs::read_to_string("./prompts/system.txt")?,
        guardrails: fs::read_to_string("./prompts/guardrails.txt")?,
    })
}

pub fn config() -> ModelConfig {
    ModelConfig {
        api_key: std::env::var("OPENROUTER_API_KEY").unwrap_or_default(),
        http_referer: String::new(),
        x_title: "IA Devs - Guardrails".into(),
        models: vec!["qwen/qwen-2.5-7b-instruct".into()],
        guardrails_model: "openai/gpt-oss-safeguard-20b".into(),
        provider: Provider {
            sort: ProviderSort {
                by: "price".into(),
                partition: "none".into(),
            },
        },
        temperature: 0.7,
        max_tokens: 1000,
    }
}

pub fn get_user(users: &Users, username: &str) -> Option<User> {
    users.get(username).cloned()
}
