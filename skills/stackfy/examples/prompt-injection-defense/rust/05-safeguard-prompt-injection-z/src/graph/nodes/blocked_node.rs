use crate::config::Prompts;
use crate::graph::{GraphState, Message, Update};
use crate::prompt_template;

pub fn blocked_node(prompts: &Prompts, state: &GraphState) -> Vec<Update> {
    let guard_rail_check = state.guardrail_check.as_ref();
    let analysis = guard_rail_check
        .and_then(|check| check.analysis.as_deref())
        .filter(|analysis| !analysis.is_empty())
        .map(|analysis| format!("**Analysis:** {analysis}"))
        .unwrap_or_default();
    let reason = guard_rail_check
        .and_then(|check| check.reason.as_deref())
        .unwrap_or("Security check failed");
    let permissions = state.user.permissions.join(", ");

    let blocked_message = prompt_template::format(
        &prompts.blocked,
        &[
            ("REASON", reason),
            ("ANALYSIS", &analysis),
            ("USER_ROLE", &state.user.role),
            ("PERMISSIONS", &permissions),
        ],
    );

    vec![Update::Messages(vec![Message::Ai(blocked_message)])]
}
