use crate::config::Prompts;
use crate::graph::{GraphState, Message, Update};
use crate::prompt_template;
use crate::services::openrouter_service::OpenRouterService;

const APOLOGY: &str =
    "I apologize, but I encountered an error processing your request. Please try again later.";

pub async fn chat_node(
    open_router_service: &mut OpenRouterService,
    prompts: &Prompts,
    state: &GraphState,
) -> Vec<Update> {
    let user_prompt = state.last_text();
    let system_prompt = prompt_template::format(
        &prompts.system,
        &[
            ("USER_ROLE", &state.user.role),
            ("USER_NAME", &state.user.display_name),
        ],
    );

    let response = open_router_service
        .generate(&system_prompt, user_prompt)
        .await
        .unwrap_or_else(|error| {
            eprintln!("Chat node error: {error}");

            APOLOGY.into()
        });

    vec![Update::Messages(vec![Message::Ai(response)])]
}
