use crate::config::Config;
use mongodb::Client;
use mongodb::Collection;
use mongodb::bson::Document;

pub async fn get_db(config: &Config) -> mongodb::error::Result<Collection<Document>> {
    let db_client = Client::with_uri_str(&config.db_url).await?;
    let db_users = db_client
        .database(&config.db_name)
        .collection(config.collection);

    println!("Connected to the database");

    Ok(db_users)
}
