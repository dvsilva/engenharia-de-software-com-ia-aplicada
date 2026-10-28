use crate::graph::{GraphState, Update};
use crate::prompts::v1::summarization::{
    get_summarization_system_prompt, get_summarization_user_prompt, summary_schema,
};
use crate::services::openrouter_service::OpenRouterService;
use crate::services::preferences_service::PreferencesService;
use std::error::Error;

pub fn summarization_node(
    llm_client: &OpenRouterService,
    preferences_service: &PreferencesService,
    state: &GraphState,
    user_id: &str,
) -> Result<Vec<Update>, Box<dyn Error>> {
    let conversation_history: Vec<(&str, &str)> = state
        .messages
        .iter()
        .map(|message| (message.role(), message.text()))
        .collect();
    let system_prompt = get_summarization_system_prompt();
    let user_prompt =
        get_summarization_user_prompt(&conversation_history, state.conversation_summary.as_ref());

    let summary =
        match llm_client.generate_structured(&system_prompt, &user_prompt, &summary_schema()) {
            Ok(Some(summary)) => summary,
            failure => {
                let error = failure.err().unwrap_or_else(|| "undefined".into());

                eprintln!("❌ Falha ao sumarizar conversa: {error}");
                return Ok(vec![Update::NeedsSummarization(false)]);
            }
        };

    preferences_service.store_summary(user_id, &summary)?;

    Ok(vec![
        Update::RemoveOldestMessages(state.messages.len().saturating_sub(2)),
        Update::ConversationSummary(summary),
        Update::NeedsSummarization(false),
    ])
}
