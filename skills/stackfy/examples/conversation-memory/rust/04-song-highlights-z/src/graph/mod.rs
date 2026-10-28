pub mod factory;
pub mod nodes;

use crate::services::memory_service::MemoryService;
use crate::services::openrouter_service::OpenRouterService;
use crate::services::preferences_service::PreferencesService;
use nodes::chat_node::chat_node;
use nodes::edge_conditions::{Route, route_after_chat, route_after_save_preferences};
use nodes::save_preferences_node::save_preferences_node;
use nodes::summarization_node::summarization_node;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::rc::Rc;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "text", rename_all = "lowercase")]
pub enum Message {
    Human(String),
    Ai(String),
}

impl Message {
    pub fn text(&self) -> &str {
        match self {
            Message::Human(text) | Message::Ai(text) => text,
        }
    }

    pub fn role(&self) -> &'static str {
        match self {
            Message::Human(_) => "User",
            Message::Ai(_) => "AI",
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphState {
    pub messages: Vec<Message>,
    pub user_context: Option<String>,
    pub extracted_preferences: Option<Value>,
    pub needs_summarization: Option<bool>,
    pub conversation_summary: Option<Value>,
    pub user_id: Option<String>,
}

pub enum Update {
    Messages(Vec<Message>),
    RemoveOldestMessages(usize),
    ExtractedPreferences(Option<Value>),
    NeedsSummarization(bool),
    ConversationSummary(Value),
}

pub struct Input {
    pub messages: Vec<Message>,
    pub user_context: Option<String>,
    pub user_id: Option<String>,
}

pub struct RunConfig {
    pub thread_id: String,
    pub user_id: String,
}

pub struct ChatGraph {
    llm_client: OpenRouterService,
    preferences_service: Rc<PreferencesService>,
    memory_service: MemoryService,
    max_messages_to_summary: usize,
}

impl GraphState {
    fn apply(&mut self, updates: Vec<Update>) {
        for update in updates {
            match update {
                Update::Messages(messages) => self.messages.extend(messages),
                Update::RemoveOldestMessages(count) => {
                    self.messages.drain(..count);
                }
                Update::ExtractedPreferences(preferences) => {
                    self.extracted_preferences = preferences
                }
                Update::NeedsSummarization(needed) => self.needs_summarization = Some(needed),
                Update::ConversationSummary(summary) => self.conversation_summary = Some(summary),
            }
        }
    }

    pub fn last_text(&self) -> &str {
        self.messages.last().map(Message::text).unwrap_or_default()
    }
}

pub fn build_chat_graph(
    llm_client: OpenRouterService,
    preferences_service: Rc<PreferencesService>,
    memory_service: MemoryService,
    max_messages_to_summary: usize,
) -> ChatGraph {
    ChatGraph {
        llm_client,
        preferences_service,
        memory_service,
        max_messages_to_summary,
    }
}

impl ChatGraph {
    fn run_node(
        &self,
        route: &Route,
        state: &GraphState,
        user_id: &str,
    ) -> Result<Vec<Update>, Box<dyn Error>> {
        match route {
            Route::Chat => chat_node(
                &self.llm_client,
                &self.preferences_service,
                self.max_messages_to_summary,
                state,
                user_id,
            ),
            Route::SavePreferences => {
                save_preferences_node(&self.preferences_service, state, user_id)
            }
            Route::Summarize => {
                summarization_node(&self.llm_client, &self.preferences_service, state, user_id)
            }
            Route::End => Ok(Vec::new()),
        }
    }

    fn next(route: &Route, state: &GraphState) -> Route {
        match route {
            Route::Chat => route_after_chat(state),
            Route::SavePreferences => route_after_save_preferences(state),
            Route::Summarize | Route::End => Route::End,
        }
    }

    pub fn invoke(
        &mut self,
        input: Input,
        config: &RunConfig,
    ) -> Result<GraphState, Box<dyn Error>> {
        let mut state = self
            .memory_service
            .get(&config.thread_id)?
            .unwrap_or_default();

        state.messages.extend(input.messages);
        if input.user_context.is_some() {
            state.user_context = input.user_context;
        }
        if input.user_id.is_some() {
            state.user_id = input.user_id;
        }
        self.memory_service.put(&config.thread_id, &state)?;

        let mut route = Route::Chat;

        while route != Route::End {
            let updates = self.run_node(&route, &state, &config.user_id)?;

            state.apply(updates);
            self.memory_service.put(&config.thread_id, &state)?;
            route = Self::next(&route, &state);
        }

        Ok(state)
    }
}
