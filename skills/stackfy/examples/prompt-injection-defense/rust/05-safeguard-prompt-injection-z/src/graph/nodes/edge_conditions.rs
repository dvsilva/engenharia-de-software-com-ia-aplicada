use crate::graph::GraphState;

#[derive(PartialEq)]
pub enum Route {
    GuardrailsCheck,
    Chat,
    Blocked,
    End,
}

pub fn route_after_guardrails(state: &GraphState) -> Route {
    if !state.guardrails_enabled {
        return Route::Chat;
    }

    match &state.guardrail_check {
        Some(check) if !check.safe => Route::Blocked,
        _ => Route::Chat,
    }
}
