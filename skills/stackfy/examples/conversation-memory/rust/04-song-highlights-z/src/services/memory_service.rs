use crate::config::ModelConfig;
use crate::graph::GraphState;
use postgres::{Client, NoTls};
use std::error::Error;

pub struct MemoryService {
    client: Client,
}

pub fn create_memory_service(config: &ModelConfig) -> Result<MemoryService, Box<dyn Error>> {
    let mut client = Client::connect(&config.memory_db_uri, NoTls)?;

    client.batch_execute(
        "CREATE TABLE IF NOT EXISTS thread_states (thread_id TEXT PRIMARY KEY, state TEXT NOT NULL)",
    )?;

    println!("✅ Memória configurada: PostgreSQL");
    Ok(MemoryService { client })
}

impl MemoryService {
    pub fn get(&mut self, thread_id: &str) -> Result<Option<GraphState>, Box<dyn Error>> {
        let row = self.client.query_opt(
            "SELECT state FROM thread_states WHERE thread_id = $1",
            &[&thread_id],
        )?;

        match row {
            Some(row) => Ok(Some(serde_json::from_str(row.get(0))?)),
            None => Ok(None),
        }
    }

    pub fn put(&mut self, thread_id: &str, state: &GraphState) -> Result<(), Box<dyn Error>> {
        self.client.execute(
            "INSERT INTO thread_states (thread_id, state) VALUES ($1, $2)
             ON CONFLICT (thread_id) DO UPDATE SET state = excluded.state",
            &[&thread_id, &serde_json::to_string(state)?],
        )?;

        Ok(())
    }
}
