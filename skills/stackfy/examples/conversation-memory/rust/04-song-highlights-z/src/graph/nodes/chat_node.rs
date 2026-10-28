use crate::graph::{GraphState, Message, Update};
use crate::prompts::v1::chat_response::{
    chat_response_schema, get_system_prompt, get_user_prompt_template,
};
use crate::services::openrouter_service::OpenRouterService;
use crate::services::preferences_service::PreferencesService;
use std::error::Error;

const APOLOGY: &str = "Desculpe, encontrei um erro. Pode tentar novamente?";

pub fn chat_node(
    llm_client: &OpenRouterService,
    preferences_service: &PreferencesService,
    max_messages_to_summary: usize,
    state: &GraphState,
    user_id: &str,
) -> Result<Vec<Update>, Box<dyn Error>> {
    let user_context = match &state.user_context {
        Some(context) => Some(context.clone()),
        None => preferences_service.get_basic_info(user_id)?,
    };
    let system_prompt = get_system_prompt(user_context.as_deref());
    let conversation_history = state
        .messages
        .iter()
        .map(|message| format!("{}: {}", message.role(), message.text()))
        .collect::<Vec<_>>()
        .join("\n");
    let user_prompt = get_user_prompt_template(state.last_text(), Some(&conversation_history));
    let schema = chat_response_schema();

    let response = match llm_client.generate_structured(&system_prompt, &user_prompt, &schema) {
        Ok(Some(response)) => response,
        failure => {
            let error = failure.err().unwrap_or_else(|| "undefined".into());

            eprintln!("❌ Falha ao gerar resposta: {error}");
            return Ok(vec![Update::Messages(vec![Message::Ai(APOLOGY.into())])]);
        }
    };

    let needs_summarization = state.messages.len() >= max_messages_to_summary;
    let should_save = response["shouldSavePreferences"] == true;

    Ok(vec![
        Update::Messages(vec![Message::Ai(
            response["message"].as_str().unwrap_or_default().into(),
        )]),
        Update::ExtractedPreferences(response.get("preferences").filter(|_| should_save).cloned()),
        Update::NeedsSummarization(needs_summarization),
    ])
}
