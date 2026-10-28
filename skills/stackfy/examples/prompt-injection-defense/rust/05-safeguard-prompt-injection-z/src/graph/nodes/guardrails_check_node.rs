use crate::config::Prompts;
use crate::graph::{GraphState, Update};
use crate::prompt_template;
use crate::services::openrouter_service::{GuardrailResult, OpenRouterService};

pub async fn guardrails_check_node(
    open_router_service: &OpenRouterService,
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
    let message = format!("{system_prompt}\n{user_prompt}");

    let result = open_router_service
        .check_guard_rails(&prompts.guardrails, &message, state.guardrails_enabled)
        .await
        .unwrap_or_else(|error| {
            eprintln!("Guardrails check failed: {error}");

            GuardrailResult {
                safe: false,
                reason: Some("Guardrails service unavailable - request blocked for safety".into()),
                analysis: None,
            }
        });

    vec![Update::GuardrailCheck(result)]
}
