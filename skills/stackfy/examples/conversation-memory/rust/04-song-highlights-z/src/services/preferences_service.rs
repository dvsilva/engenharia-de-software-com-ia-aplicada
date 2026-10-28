use rusqlite::types::Value as Column;
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde_json::{Number, Value};
use std::cell::Cell;
use std::error::Error;

#[derive(Debug, Default)]
pub struct ConversationSummary {
    pub name: Option<String>,
    pub age: Option<Number>,
    pub favorite_genres: Option<Vec<String>>,
    pub favorite_bands: Option<Vec<String>>,
    pub key_preferences: Option<String>,
    pub important_context: Option<String>,
}

pub struct PreferencesService {
    db: Connection,
    is_setup: Cell<bool>,
}

const UPSERT: &str = "INSERT INTO user_preferences
    (user_id, name, age, favorite_genres, favorite_bands, key_preferences, important_context, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO UPDATE SET
        name = excluded.name,
        age = excluded.age,
        favorite_genres = excluded.favorite_genres,
        favorite_bands = excluded.favorite_bands,
        key_preferences = excluded.key_preferences,
        important_context = excluded.important_context,
        updated_at = excluded.updated_at";

fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(flag) => *flag,
        Value::Number(number) => number.as_f64().is_some_and(|amount| amount != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn truthy(value: &Value) -> Option<Value> {
    Some(value)
        .filter(|candidate| is_truthy(candidate))
        .cloned()
}

fn unique(items: impl IntoIterator<Item = String>) -> Vec<String> {
    items.into_iter().fold(Vec::new(), |mut kept, item| {
        if !kept.contains(&item) {
            kept.push(item);
        }
        kept
    })
}

fn merged_list(existing: &Option<Vec<String>>, added: &Value) -> Option<Vec<String>> {
    let Some(added) = added.as_array().filter(|items| !items.is_empty()) else {
        return existing.clone();
    };
    let added = added.iter().filter_map(Value::as_str).map(String::from);

    Some(unique(
        existing
            .clone()
            .unwrap_or_default()
            .into_iter()
            .chain(added),
    ))
}

fn column(value: Option<Value>) -> Column {
    match value {
        None | Some(Value::Null) => Column::Null,
        Some(Value::Bool(flag)) => Column::Integer(flag.into()),
        Some(Value::Number(number)) => number
            .as_i64()
            .map(Column::Integer)
            .unwrap_or_else(|| Column::Real(number.as_f64().unwrap_or_default())),
        Some(Value::String(text)) => Column::Text(text),
        Some(json) => Column::Text(json.to_string()),
    }
}

fn json_list(list: Option<Vec<String>>) -> Result<Column, serde_json::Error> {
    list.map_or(Ok(Column::Null), |items| {
        serde_json::to_string(&items).map(Column::Text)
    })
}

fn text_column(row: &Row, name: &str) -> rusqlite::Result<Option<String>> {
    Ok(row
        .get::<_, Option<String>>(name)?
        .filter(|text| !text.is_empty()))
}

fn number_column(row: &Row, name: &str) -> rusqlite::Result<Option<Number>> {
    Ok(match row.get::<_, Column>(name)? {
        Column::Integer(number) if number != 0 => Some(number.into()),
        Column::Real(number) if number != 0.0 => Number::from_f64(number),
        _ => None,
    })
}

fn list_column(row: &Row, name: &str) -> Result<Option<Vec<String>>, Box<dyn Error>> {
    text_column(row, name)?
        .map(|text| serde_json::from_str(&text))
        .transpose()
        .map_err(Into::into)
}

fn summary_of(row: &Row) -> Result<ConversationSummary, Box<dyn Error>> {
    Ok(ConversationSummary {
        name: text_column(row, "name")?,
        age: number_column(row, "age")?,
        favorite_genres: list_column(row, "favorite_genres")?,
        favorite_bands: list_column(row, "favorite_bands")?,
        key_preferences: row.get("key_preferences")?,
        important_context: text_column(row, "important_context")?,
    })
}

impl PreferencesService {
    pub fn new(db_path: &str) -> Result<Self, Box<dyn Error>> {
        Ok(Self {
            db: Connection::open(db_path.replacen("file:", "", 1))?,
            is_setup: Cell::new(false),
        })
    }

    pub fn setup(&self) -> Result<(), Box<dyn Error>> {
        if self.is_setup.get() {
            return Ok(());
        }

        self.db.execute_batch(
            "CREATE TABLE IF NOT EXISTS `user_preferences` (`id` integer not null primary key autoincrement, `user_id` varchar(255) not null, `name` varchar(255), `age` integer, `favorite_genres` json, `favorite_bands` json, `key_preferences` text, `important_context` text, `updated_at` datetime default CURRENT_TIMESTAMP);
             CREATE UNIQUE INDEX IF NOT EXISTS `user_preferences_user_id_unique` on `user_preferences` (`user_id`);",
        )?;

        self.is_setup.set(true);
        Ok(())
    }

    pub fn merge_preferences(&self, user_id: &str, prefs: &Value) -> Result<(), Box<dyn Error>> {
        self.setup()?;

        let existing = self.get_summary(user_id)?.unwrap_or_default();
        let merged_genres = merged_list(&existing.favorite_genres, &prefs["favoriteGenres"]);
        let merged_bands = merged_list(&existing.favorite_bands, &prefs["favoriteBands"]);
        let context_parts: Vec<String> = [
            existing.important_context.clone(),
            truthy(&prefs["mood"])
                .map(|mood| format!("Mood: {}", mood.as_str().unwrap_or_default())),
            truthy(&prefs["listeningContext"])
                .map(|context| format!("Context: {}", context.as_str().unwrap_or_default())),
            truthy(&prefs["additionalInfo"]).map(|info| info.as_str().unwrap_or_default().into()),
        ]
        .into_iter()
        .flatten()
        .filter(|part| !part.is_empty())
        .collect();

        self.db.execute(
            UPSERT,
            params![
                user_id,
                column(truthy(&prefs["name"]).or(existing.name.map(Value::from))),
                column(truthy(&prefs["age"]).or(existing.age.map(Value::from))),
                json_list(merged_genres)?,
                json_list(merged_bands)?,
                existing.key_preferences.filter(|text| !text.is_empty()),
                Some(context_parts.join(". ")).filter(|text| !text.is_empty()),
            ],
        )?;

        Ok(())
    }

    pub fn store_summary(&self, user_id: &str, summary: &Value) -> Result<(), Box<dyn Error>> {
        self.setup()?;

        let list =
            |name: &str| column(truthy(&summary[name]).map(|items| Value::from(items.to_string())));

        self.db.execute(
            UPSERT,
            params![
                user_id,
                column(truthy(&summary["name"])),
                column(truthy(&summary["age"])),
                list("favoriteGenres"),
                list("favoriteBands"),
                column(Some(summary["keyPreferences"].clone())),
                column(truthy(&summary["importantContext"])),
            ],
        )?;

        Ok(())
    }

    pub fn get_summary(
        &self,
        user_id: &str,
    ) -> Result<Option<ConversationSummary>, Box<dyn Error>> {
        self.setup()?;

        let mut statement = self
            .db
            .prepare("SELECT * FROM user_preferences WHERE user_id = ?1 LIMIT 1")?;
        let row = statement
            .query_row([user_id], |row| Ok(summary_of(row)))
            .optional()?;

        row.transpose()
    }

    pub fn get_basic_info(&self, user_id: &str) -> Result<Option<String>, Box<dyn Error>> {
        let Some(summary) = self.get_summary(user_id)? else {
            return Ok(None);
        };
        let mut parts = Vec::new();

        if let Some(name) = summary.name {
            parts.push(format!("Nome: {name}"));
        }
        if let Some(age) = summary.age {
            parts.push(format!("Idade: {age}"));
        }
        if let Some(genres) = summary.favorite_genres.filter(|genres| !genres.is_empty()) {
            parts.push(format!("Gêneros Favoritos: {}", genres.join(", ")));
        }
        if let Some(bands) = summary.favorite_bands.filter(|bands| !bands.is_empty()) {
            parts.push(format!("Artistas/Bandas Favoritas: {}", bands.join(", ")));
        }
        if let Some(key_preferences) = summary.key_preferences.filter(|text| !text.is_empty()) {
            parts.push(format!("\nPreferências: {key_preferences}"));
        }

        Ok(Some(parts.join("\n")).filter(|info| !info.is_empty()))
    }
}
