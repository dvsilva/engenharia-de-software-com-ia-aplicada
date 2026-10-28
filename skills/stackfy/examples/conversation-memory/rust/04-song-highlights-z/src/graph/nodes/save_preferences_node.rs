use crate::graph::{GraphState, Update};
use crate::services::preferences_service::PreferencesService;
use std::error::Error;

pub fn save_preferences_node(
    preferences_service: &PreferencesService,
    state: &GraphState,
    user_id: &str,
) -> Result<Vec<Update>, Box<dyn Error>> {
    let Some(preferences) = &state.extracted_preferences else {
        return Ok(Vec::new());
    };

    preferences_service.merge_preferences(user_id, preferences)?;

    Ok(vec![Update::ExtractedPreferences(None)])
}
