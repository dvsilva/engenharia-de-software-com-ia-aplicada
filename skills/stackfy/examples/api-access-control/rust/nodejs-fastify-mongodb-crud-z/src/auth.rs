use crate::config::REQUESTS_PER_MINUTE;
use crate::http::{Reply, internal_error};
use crate::rate_limit::FixedWindow;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde_json::{Map, Value, json};
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub struct AuthUser {
    pub username: &'static str,
    pub password: &'static str,
    pub role: &'static str,
}

pub const AUTH_USERS: [AuthUser; 2] = [
    AuthUser {
        username: "erickwendel",
        password: "123123",
        role: "admin",
    },
    AuthUser {
        username: "ananeri",
        password: "1234",
        role: "member",
    },
];

pub const JWT_SECRET: &str = "supersecret";
pub const ADMIN_SUPER_SECRET: &str = "AM I THE BOSS?";

const PUBLIC_ROUTES: [&str; 3] = ["/v1/health", "/v1/auth/login", "/v1/auth/service-token"];

const HMAC_ALGORITHMS: [Algorithm; 3] = [Algorithm::HS256, Algorithm::HS384, Algorithm::HS512];

const BEARER: &str = "bearer ";

pub fn without_bearer(authorization: &str) -> String {
    match authorization.to_ascii_lowercase().find(BEARER) {
        Some(start) => format!(
            "{}{}",
            &authorization[..start],
            &authorization[start + BEARER.len()..]
        ),
        None => authorization.into(),
    }
}

pub fn rate_limit_key(authorization: Option<&str>, address: IpAddr) -> String {
    authorization
        .map(without_bearer)
        .unwrap_or_else(|| address.to_string())
}

fn verify_jwt(authorization: Option<&str>) -> Result<Map<String, Value>, String> {
    let header = authorization.ok_or("No Authorization was found in request.headers")?;
    let token = match header.split(' ').collect::<Vec<_>>().as_slice() {
        [scheme, token] if scheme.eq_ignore_ascii_case("bearer") => *token,
        _ => return Err("Format is Authorization: Bearer [token]".into()),
    };

    let mut validation = Validation::new(Algorithm::HS256);
    validation.algorithms = HMAC_ALGORITHMS.to_vec();
    validation.required_spec_claims.clear();
    validation.leeway = 0;
    validation.validate_nbf = true;
    validation.validate_aud = false;

    decode::<Map<String, Value>>(
        token,
        &DecodingKey::from_secret(JWT_SECRET.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|error| error.to_string())
}

fn text<'a>(body: &'a Value, field: &str) -> &'a str {
    body[field].as_str().unwrap_or_default()
}

fn find_user(body: &Value) -> Option<&'static AuthUser> {
    let username = text(body, "username").to_lowercase();
    let password = text(body, "password");

    AUTH_USERS
        .iter()
        .find(|user| user.username.to_lowercase() == username && user.password == password)
}

fn invalid_credentials() -> Reply {
    Reply::json(401, json!({ "message": "Invalid credentials" }))
}

pub fn require_role(role: &str, caller_role: Option<&Value>) -> Option<Reply> {
    (caller_role.and_then(Value::as_str) != Some(role)).then(|| {
        Reply::json(
            403,
            json!({ "message": "Forbidden: insufficient permissions" }),
        )
    })
}

pub struct Auth {
    issued_service_tokens: Mutex<HashMap<String, &'static str>>,
    pub rate_limit: FixedWindow,
}

impl Auth {
    pub fn new() -> Self {
        Self {
            issued_service_tokens: Mutex::new(HashMap::new()),
            rate_limit: FixedWindow::new(REQUESTS_PER_MINUTE, Duration::from_secs(60)),
        }
    }

    pub fn authenticate(
        &self,
        url: &str,
        authorization: Option<&str>,
    ) -> Result<Option<Value>, Reply> {
        if PUBLIC_ROUTES.contains(&url) {
            return Ok(None);
        }

        let token = authorization.map(without_bearer).unwrap_or_default();
        let service_role = self
            .issued_service_tokens
            .lock()
            .expect("the issued service tokens")
            .get(&token)
            .copied();
        if let Some(role) = service_role {
            return Ok(Some(Value::String(role.into())));
        }

        match verify_jwt(authorization) {
            Ok(claims) => Ok(Some(claims.get("role").cloned().unwrap_or(Value::Null))),
            Err(error) => {
                eprintln!("[onRequest] {error}");
                Err(Reply::json(401, json!({ "message": "Unauthorized" })))
            }
        }
    }

    pub fn login(&self, body: &Value) -> Reply {
        let Some(user) = find_user(body) else {
            return invalid_credentials();
        };

        let issued_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or_default();
        let claims =
            json!({ "username": text(body, "username"), "role": user.role, "iat": issued_at });

        match encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(JWT_SECRET.as_bytes()),
        ) {
            Ok(token) => Reply::json(200, json!({ "token": token })),
            Err(error) => internal_error(error),
        }
    }

    pub fn issue_service_token(&self, body: &Value) -> Reply {
        if text(body, "adminSuperSecret") != ADMIN_SUPER_SECRET {
            return Reply::json(401, json!({ "message": "Invalid adminSuperSecret" }));
        }

        let Some(user) = find_user(body) else {
            return invalid_credentials();
        };

        let service_token = Uuid::new_v4().to_string();
        self.issued_service_tokens
            .lock()
            .expect("the issued service tokens")
            .insert(service_token.clone(), user.role);

        Reply::json(
            200,
            json!({ "role": user.role, "serviceToken": service_token }),
        )
    }
}
