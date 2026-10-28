mod auth;
mod config;
mod db;
mod http;
mod rate_limit;

use auth::{Auth, rate_limit_key, require_role};
use axum::Router;
use axum::body::{Body, to_bytes};
use axum::extract::{ConnectInfo, Request, State};
use axum::http::Method;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use futures::TryStreamExt;
use http::{Reply, error_reply, internal_error, parse_body, route_not_found, validate_body};
use mongodb::Collection;
use mongodb::bson::oid::ObjectId;
use mongodb::bson::{Bson, Document, doc, to_document};
use rate_limit::{Usage, wait_text};
use serde_json::{Map, Value, json};
use std::env;
use std::error::Error;
use std::net::{Ipv6Addr, SocketAddr};
use std::process::exit;
use std::sync::Arc;
use tokio::net::TcpListener;

const BODY_LIMIT: usize = 1024 * 1024;

type Outcome = Result<Reply, Box<dyn Error>>;

enum Route {
    Health,
    Login,
    ServiceToken,
    ListCustomers,
    FindCustomer(String),
    CreateCustomer,
    UpdateCustomer(String),
    DeleteCustomer(String),
}

impl Route {
    fn find(method: &Method, path: &str) -> Option<Self> {
        let segments: Vec<&str> = path.strip_prefix('/')?.split('/').collect();

        match (method.as_str(), segments.as_slice()) {
            ("GET", ["v1", "health"]) => Some(Self::Health),
            ("POST", ["v1", "auth", "login"]) => Some(Self::Login),
            ("POST", ["v1", "auth", "service-token"]) => Some(Self::ServiceToken),
            ("GET", ["v1", "customers"]) => Some(Self::ListCustomers),
            ("POST", ["v1", "customers"]) => Some(Self::CreateCustomer),
            ("GET", ["v1", "customers", id]) => Some(Self::FindCustomer((*id).into())),
            ("PUT", ["v1", "customers", id]) => Some(Self::UpdateCustomer((*id).into())),
            ("DELETE", ["v1", "customers", id]) => Some(Self::DeleteCustomer((*id).into())),
            _ => None,
        }
    }

    fn required_body(&self) -> Option<&'static [&'static str]> {
        match self {
            Self::Login => Some(&["username", "password"]),
            Self::ServiceToken => Some(&["username", "password", "adminSuperSecret"]),
            Self::CreateCustomer | Self::UpdateCustomer(_) => Some(&["name", "phone"]),
            _ => None,
        }
    }

    fn bad_request_fields(&self) -> Option<&'static [&'static str]> {
        match self {
            Self::UpdateCustomer(_) => Some(&["message", "id"]),
            _ => None,
        }
    }

    fn admin_only(&self) -> bool {
        matches!(
            self,
            Self::CreateCustomer | Self::UpdateCustomer(_) | Self::DeleteCustomer(_)
        )
    }
}

struct App {
    db_users: Collection<Document>,
    auth: Auth,
}

fn bson_to_json(value: &Bson) -> Value {
    match value {
        Bson::ObjectId(id) => Value::String(id.to_hex()),
        Bson::Document(document) => document_to_json(document),
        Bson::Array(items) => Value::Array(items.iter().map(bson_to_json).collect()),
        other => other.clone().into_relaxed_extjson(),
    }
}

fn document_to_json(document: &Document) -> Value {
    Value::Object(
        document
            .iter()
            .map(|(key, value)| (key.clone(), bson_to_json(value)))
            .collect(),
    )
}

fn invalid_id(id: &str) -> Reply {
    Reply::json(400, json!({ "message": "the id is invalid!", "id": id }))
}

fn with_cors(reply: Reply) -> Reply {
    reply
        .with_header("access-control-allow-origin", "*")
        .with_header(
            "access-control-allow-methods",
            "GET,POST,PUT,DELETE,OPTIONS",
        )
        .with_header("access-control-allow-headers", "*")
}

fn with_rate_limit(reply: Reply, usage: &Usage) -> Reply {
    reply
        .with_header("x-ratelimit-limit", usage.limit)
        .with_header("x-ratelimit-remaining", usage.remaining)
        .with_header("x-ratelimit-reset", usage.reset_seconds)
}

fn too_many_requests(usage: &Usage) -> Reply {
    let message = format!(
        "Rate limit exceeded, retry in {}",
        wait_text(usage.reset_seconds)
    );

    with_rate_limit(
        Reply::json(
            429,
            json!({ "statusCode": 429, "error": "Too Many Requests", "message": message }),
        ),
        usage,
    )
    .with_header("retry-after", usage.reset_seconds)
}

fn answer_unknown(method: &Method, url: &str) -> Reply {
    let reply = if method == Method::OPTIONS {
        Reply::empty(200)
    } else {
        route_not_found(method.as_str(), url)
    };

    with_cors(reply)
}

async fn read_body(body: Body, content_type: Option<&str>, route: &Route) -> Result<Value, Reply> {
    let Some(required) = route.required_body() else {
        return Ok(Value::Null);
    };
    let bytes = to_bytes(body, BODY_LIMIT).await.map_err(|_| {
        error_reply(
            413,
            "FST_ERR_CTP_BODY_TOO_LARGE",
            "Payload Too Large",
            "Request body is too large",
        )
    })?;
    let serialized = |refused: Reply| match route.bad_request_fields() {
        Some(fields) => refused.with_response_schema(400, fields),
        None => refused,
    };
    let mut value = parse_body(content_type, &bytes).map_err(serialized)?;

    validate_body(&mut value, required).map_err(serialized)?;

    Ok(value)
}

async fn list_customers(db_users: &Collection<Document>) -> Outcome {
    let customers: Vec<Document> = db_users
        .find(doc! {})
        .sort(doc! { "name": 1 })
        .await?
        .try_collect()
        .await?;

    Ok(Reply::json(
        200,
        Value::Array(customers.iter().map(document_to_json).collect()),
    ))
}

async fn find_customer(db_users: &Collection<Document>, id: &str) -> Outcome {
    let Ok(object_id) = ObjectId::parse_str(id) else {
        return Ok(invalid_id(id));
    };
    let Some(user) = db_users.find_one(doc! { "_id": object_id }).await? else {
        return Ok(Reply::json(404, json!({})));
    };

    let mut answer = Map::new();
    answer.insert("id".into(), Value::String(id.into()));
    for field in ["name", "phone"] {
        if let Some(value) = user.get(field) {
            answer.insert(field.into(), bson_to_json(value));
        }
    }

    Ok(Reply::json(200, Value::Object(answer)))
}

async fn create_customer(db_users: &Collection<Document>, user: Value) -> Outcome {
    let name = user["name"].as_str().unwrap_or_default().to_string();
    let result = db_users.insert_one(to_document(&user)?).await?;
    let id = result
        .inserted_id
        .as_object_id()
        .map(|id| id.to_hex())
        .unwrap_or_default();

    Ok(Reply::json(
        201,
        json!({ "message": format!("user {name} created!"), "id": id }),
    ))
}

async fn update_customer(db_users: &Collection<Document>, id: &str, user: Value) -> Outcome {
    let Ok(object_id) = ObjectId::parse_str(id) else {
        return Ok(invalid_id(id));
    };
    let result = db_users
        .update_one(
            doc! { "_id": object_id },
            doc! { "$set": to_document(&user)? },
        )
        .await?;

    if result.modified_count == 0 {
        return Ok(Reply::json(
            404,
            json!({ "message": "User not found or no changes made", "id": id }),
        ));
    }

    Ok(Reply::json(
        200,
        json!({ "message": format!("User {id} updated!"), "id": id }),
    ))
}

async fn delete_customer(db_users: &Collection<Document>, id: &str) -> Outcome {
    let Ok(object_id) = ObjectId::parse_str(id) else {
        return Ok(invalid_id(id));
    };
    let result = db_users.delete_one(doc! { "_id": object_id }).await?;

    if result.deleted_count == 0 {
        return Ok(Reply::empty(404));
    }

    Ok(Reply::json(
        200,
        json!({ "message": format!("User {id} deleted!"), "id": id }),
    ))
}

impl App {
    async fn answer(&self, route: Route, role: Option<Value>, body: Value) -> Reply {
        if route.admin_only()
            && let Some(refused) = require_role("admin", role.as_ref())
        {
            return refused;
        }

        let outcome = match route {
            Route::Health => Ok(Reply::json(
                200,
                json!({ "app": "customers", "version": "v1.0.1" }),
            )),
            Route::Login => Ok(self.auth.login(&body)),
            Route::ServiceToken => Ok(self.auth.issue_service_token(&body)),
            Route::ListCustomers => list_customers(&self.db_users).await,
            Route::FindCustomer(id) => find_customer(&self.db_users, &id).await,
            Route::CreateCustomer => create_customer(&self.db_users, body).await,
            Route::UpdateCustomer(id) => update_customer(&self.db_users, &id, body).await,
            Route::DeleteCustomer(id) => delete_customer(&self.db_users, &id).await,
        };

        outcome.unwrap_or_else(internal_error)
    }
}

async fn handle(
    State(app): State<Arc<App>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    request: Request,
) -> Response {
    let (parts, body) = request.into_parts();
    let url = parts
        .uri
        .path_and_query()
        .map_or("/", |value| value.as_str());
    let header = |name| {
        parts
            .headers
            .get(name)
            .and_then(|value| value.to_str().ok())
    };
    let authorization = header(AUTHORIZATION);

    let role = match app.auth.authenticate(url, authorization) {
        Ok(role) => role,
        Err(refused) => return refused.into_response(),
    };

    let Some(route) = Route::find(&parts.method, parts.uri.path()) else {
        return answer_unknown(&parts.method, url).into_response();
    };

    let usage = app
        .auth
        .rate_limit
        .hit(&rate_limit_key(authorization, address.ip()));
    if usage.exceeded {
        return too_many_requests(&usage).into_response();
    }

    let reply = match read_body(body, header(CONTENT_TYPE), &route).await {
        Ok(body) => with_cors(app.answer(route, role, body).await),
        Err(refused) => refused,
    };

    with_rate_limit(reply, &usage).into_response()
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    if env::var("DB_NAME").unwrap_or_default().is_empty() {
        eprintln!("[error*****]: please, pass DB_NAME env before running it!");
        exit(1);
    }

    let config = config::load();
    let db_users = match db::get_db(&config).await {
        Ok(db_users) => db_users,
        Err(error) => {
            eprintln!("{error}");
            exit(1);
        }
    };
    let app = Arc::new(App {
        db_users,
        auth: Auth::new(),
    });

    let port = env::var("PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(9999);
    let listener = TcpListener::bind((Ipv6Addr::UNSPECIFIED, port)).await?;
    println!("server is running at http://[::]:{port}");

    let router = Router::new().fallback(handle).with_state(app);
    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
}
