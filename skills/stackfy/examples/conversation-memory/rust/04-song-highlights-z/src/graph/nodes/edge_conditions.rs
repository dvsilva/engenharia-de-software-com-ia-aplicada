use crate::graph::GraphState;

#[derive(Debug, PartialEq)]
pub enum Route {
    Chat,
    SavePreferences,
    Summarize,
    End,
}

fn needs_summarization(state: &GraphState) -> bool {
    state.needs_summarization == Some(true)
}

pub fn route_after_chat(state: &GraphState) -> Route {
    if state
        .extracted_preferences
        .as_ref()
        .is_some_and(|preferences| !preferences.is_null())
    {
        return Route::SavePreferences;
    }
    if needs_summarization(state) {
        return Route::Summarize;
    }

    Route::End
}

pub fn route_after_save_preferences(state: &GraphState) -> Route {
    if needs_summarization(state) {
        return Route::Summarize;
    }

    Route::End
}
