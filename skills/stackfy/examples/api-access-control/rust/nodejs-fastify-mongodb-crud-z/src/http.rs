use axum::body::Body;
use axum::http::header::CONTENT_TYPE;
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};
use std::fmt::Display;

pub struct Reply {
    status: u16,
    body: Option<Value>,
    headers: Vec<(&'static str, String)>,
}

impl Reply {
    pub fn json(status: u16, body: Value) -> Self {
        Self {
            status,
            body: Some(body),
            headers: Vec::new(),
        }
    }

    pub fn empty(status: u16) -> Self {
        Self {
            status,
            body: None,
            headers: Vec::new(),
        }
    }

    pub fn with_header(mut self, name: &'static str, value: impl ToString) -> Self {
        self.headers.push((name, value.to_string()));
        self
    }

    pub fn with_response_schema(mut self, status: u16, fields: &[&str]) -> Self {
        if self.status != status {
            return self;
        }
        if let Some(Value::Object(body)) = &self.body {
            let kept: Map<String, Value> = fields
                .iter()
                .filter_map(|field| {
                    body.get(*field)
                        .map(|value| ((*field).into(), value.clone()))
                })
                .collect();
            self.body = Some(Value::Object(kept));
        }
        self
    }
}

impl IntoResponse for Reply {
    fn into_response(self) -> Response {
        let mut response = match &self.body {
            Some(body) => Response::new(Body::from(body.to_string())),
            None => Response::new(Body::empty()),
        };
        *response.status_mut() = StatusCode::from_u16(self.status).expect("a valid status");

        let headers = response.headers_mut();
        for (name, value) in self.headers {
            if let Ok(value) = HeaderValue::from_str(&value) {
                headers.insert(HeaderName::from_static(name), value);
            }
        }
        if self.body.is_some() {
            headers.insert(
                CONTENT_TYPE,
                HeaderValue::from_static("application/json; charset=utf-8"),
            );
        }

        response
    }
}

pub fn error_reply(status: u16, code: &str, error: &str, message: &str) -> Reply {
    Reply::json(
        status,
        json!({ "statusCode": status, "code": code, "error": error, "message": message }),
    )
}

pub fn route_not_found(method: &str, url: &str) -> Reply {
    Reply::json(
        404,
        json!({
            "message": format!("Route {method}:{url} not found"),
            "error": "Not Found",
            "statusCode": 404,
        }),
    )
}

pub fn internal_error(error: impl Display) -> Reply {
    eprintln!("{error}");
    Reply::json(
        500,
        json!({ "statusCode": 500, "error": "Internal Server Error", "message": error.to_string() }),
    )
}

fn media_type(content_type: &str) -> String {
    content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
}

pub fn parse_body(content_type: Option<&str>, body: &[u8]) -> Result<Value, Reply> {
    let Some(content_type) = content_type else {
        if body.is_empty() {
            return Ok(Value::Null);
        }

        return Err(error_reply(
            415,
            "FST_ERR_CTP_INVALID_MEDIA_TYPE",
            "Unsupported Media Type",
            "Unsupported Media Type: undefined",
        ));
    };

    match media_type(content_type).as_str() {
        "application/json" if body.is_empty() => Err(error_reply(
            400,
            "FST_ERR_CTP_EMPTY_JSON_BODY",
            "Bad Request",
            "Body cannot be empty when content-type is set to 'application/json'",
        )),
        "application/json" => serde_json::from_slice(body).map_err(|_| {
            error_reply(
                400,
                "FST_ERR_CTP_INVALID_JSON_BODY",
                "Bad Request",
                "Body is not valid JSON but content-type is set to 'application/json'",
            )
        }),
        "text/plain" => Ok(Value::String(String::from_utf8_lossy(body).into())),
        _ => Err(error_reply(
            415,
            "FST_ERR_CTP_INVALID_MEDIA_TYPE",
            "Unsupported Media Type",
            &format!("Unsupported Media Type: {content_type}"),
        )),
    }
}

fn as_string(value: &Value) -> Option<Value> {
    match value {
        Value::String(_) => Some(value.clone()),
        Value::Number(number) => Some(Value::String(number.to_string())),
        Value::Bool(flag) => Some(Value::String(flag.to_string())),
        Value::Null => Some(Value::String(String::new())),
        _ => None,
    }
}

pub fn validate_body(body: &mut Value, required: &[&str]) -> Result<(), Reply> {
    let invalid = |message: String| error_reply(400, "FST_ERR_VALIDATION", "Bad Request", &message);
    let Value::Object(fields) = body else {
        return Err(invalid("body must be object".into()));
    };

    if let Some(missing) = required.iter().find(|name| !fields.contains_key(**name)) {
        return Err(invalid(format!(
            "body must have required property '{missing}'"
        )));
    }

    for name in required {
        let Some(text) = as_string(&fields[*name]) else {
            return Err(invalid(format!("body/{name} must be string")));
        };
        fields.insert((*name).into(), text);
    }

    Ok(())
}
