pub mod factory;
pub mod nodes;

use crate::config::{Prompts, User};
use crate::services::openrouter_service::{GuardrailResult, OpenRouterService};
use nodes::blocked_node::blocked_node;
use nodes::chat_node::chat_node;
use nodes::edge_conditions::{Route, route_after_guardrails};
use nodes::guardrails_check_node::guardrails_check_node;

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
}

pub struct GraphState {
    pub messages: Vec<Message>,
    pub user: User,
    pub guardrail_check: Option<GuardrailResult>,
    pub guardrails_enabled: bool,
}

pub enum Update {
    Messages(Vec<Message>),
    GuardrailCheck(GuardrailResult),
}

pub struct Input {
    pub user: User,
    pub guardrails_enabled: bool,
    pub messages: Vec<Message>,
}

pub struct ChatGraph {
    service: OpenRouterService,
    prompts: Prompts,
}

impl GraphState {
    fn apply(&mut self, updates: Vec<Update>) {
        for update in updates {
            match update {
                Update::Messages(messages) => self.messages.extend(messages),
                Update::GuardrailCheck(check) => self.guardrail_check = Some(check),
            }
        }
    }

    pub fn last_text(&self) -> &str {
        self.messages.last().map(Message::text).unwrap_or_default()
    }
}

pub fn build_chat_graph(service: OpenRouterService, prompts: Prompts) -> ChatGraph {
    ChatGraph { service, prompts }
}

impl ChatGraph {
    async fn run_node(&mut self, route: &Route, state: &GraphState) -> Vec<Update> {
        match route {
            Route::GuardrailsCheck => {
                guardrails_check_node(&self.service, &self.prompts, state).await
            }
            Route::Chat => chat_node(&mut self.service, &self.prompts, state).await,
            Route::Blocked => blocked_node(&self.prompts, state),
            Route::End => Vec::new(),
        }
    }

    fn next(route: &Route, state: &GraphState) -> Route {
        match route {
            Route::GuardrailsCheck => route_after_guardrails(state),
            Route::Chat | Route::Blocked | Route::End => Route::End,
        }
    }

    pub async fn invoke(&mut self, input: Input) -> GraphState {
        let mut state = GraphState {
            messages: input.messages,
            user: input.user,
            guardrail_check: None,
            guardrails_enabled: input.guardrails_enabled,
        };
        let mut route = Route::GuardrailsCheck;

        while route != Route::End {
            let updates = self.run_node(&route, &state).await;

            state.apply(updates);
            route = Self::next(&route, &state);
        }

        state
    }

    pub async fn close(self) {
        self.service.close().await;
    }
}
