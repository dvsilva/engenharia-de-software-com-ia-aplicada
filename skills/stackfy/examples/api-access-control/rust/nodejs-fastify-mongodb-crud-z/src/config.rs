use std::env;
use uuid::Uuid;

pub const REQUESTS_PER_MINUTE: u64 = 90;

pub struct Config {
    pub db_name: String,
    pub collection: &'static str,
    pub db_url: String,
}

fn env_or(name: &str, fallback: &str) -> String {
    env::var(name)
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.into())
}

pub fn load() -> Config {
    let random_name: String = Uuid::new_v4().to_string().chars().take(4).collect();
    let db_user = env_or("DB_USER", "root");
    let db_password = env_or("DB_PASSWORD", "example");
    let db_host = env_or("DB_HOST", "localhost");
    let db_port = env_or("DB_PORT", "27017");

    Config {
        db_name: env_or("DB_NAME", &format!("{random_name}-test")),
        collection: "customers",
        db_url: format!("mongodb://{db_user}:{db_password}@{db_host}:{db_port}"),
    }
}
