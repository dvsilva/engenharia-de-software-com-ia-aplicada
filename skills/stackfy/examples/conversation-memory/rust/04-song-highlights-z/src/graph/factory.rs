use super::{ChatGraph, build_chat_graph};
use crate::config::config;
use crate::services::memory_service::create_memory_service;
use crate::services::openrouter_service::OpenRouterService;
use crate::services::preferences_service::PreferencesService;
use std::error::Error;
use std::rc::Rc;

pub const DEFAULT_DB_PATH: &str = "./preferences.db";

pub fn build_graph(db_path: &str) -> Result<(ChatGraph, Rc<PreferencesService>), Box<dyn Error>> {
    let config = config();
    let max_messages_to_summary = config.max_messages_to_summary;
    let memory_service = create_memory_service(&config)?;
    let llm_client = OpenRouterService::new(config);
    let preferences_service = Rc::new(PreferencesService::new(db_path)?);
    let graph = build_chat_graph(
        llm_client,
        Rc::clone(&preferences_service),
        memory_service,
        max_messages_to_summary,
    );

    Ok((graph, preferences_service))
}
