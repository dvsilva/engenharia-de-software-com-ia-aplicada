use super::{ChatGraph, build_chat_graph};
use crate::config::{config, prompts};
use crate::services::openrouter_service::OpenRouterService;
use std::error::Error;

pub fn build_graph() -> Result<ChatGraph, Box<dyn Error>> {
    Ok(build_chat_graph(
        OpenRouterService::new(config()),
        prompts()?,
    ))
}
