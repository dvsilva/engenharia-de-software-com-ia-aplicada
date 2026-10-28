use song_highlights::graph::factory::build_graph;
use song_highlights::graph::{Input, Message, RunConfig};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

const TEST_DB_PATH: &str = "./test-preferences.db";

fn remove_test_db() {
    let _ = fs::remove_file(TEST_DB_PATH);
}

#[test]
fn keeps_the_conversation_history() {
    remove_test_db();

    let (mut graph, preferences_service) = build_graph(TEST_DB_PATH).expect("the graph builds");
    let user_id = "test-taylor";
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let config = RunConfig {
        thread_id: format!("{user_id}-{now}"),
        user_id: user_id.into(),
    };
    let messages = [
        "Oi, sou Taylor e adoro música pop",
        "Sou o Erick!",
        "30 anos",
        "Gosto de Guitarra",
        "Pode recomendar algo animado?",
        "Pode recomendar algo animado?",
        "Pode recomendar algo animado?",
    ];

    let result = graph.invoke(
        Input {
            messages: messages
                .iter()
                .map(|text| Message::Human((*text).into()))
                .collect(),
            user_context: None,
            user_id: Some(user_id.into()),
        },
        &config,
    );

    drop(graph);
    drop(preferences_service);
    remove_test_db();

    result.expect("the turn completes");
}
