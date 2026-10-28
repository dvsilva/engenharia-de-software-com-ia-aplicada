use crate::openrouter_service::OpenRouterService;
use serde_json::{json, Value};
use std::io::Cursor;
use tiny_http::{Header, Request, Response, Server};

const QUESTION_MIN_LENGTH: usize = 5;

type ServerError = Box<dyn std::error::Error + Send + Sync>;

pub struct Reply {
    pub status: u16,
    pub body: String,
}

pub struct App {
    router_service: OpenRouterService,
}

pub fn create_server(router_service: OpenRouterService) -> App {
    App { router_service }
}

fn error_reply(status: u16, code: &str, error: &str, message: &str) -> Reply {
    Reply {
        status,
        body: json!({ "statusCode": status, "code": code, "error": error, "message": message })
            .to_string(),
    }
}

fn validation_error(message: &str) -> Reply {
    error_reply(400, "FST_ERR_VALIDATION", "Bad Request", message)
}

fn route_not_found(method: &str, url: &str) -> Reply {
    Reply {
        status: 404,
        body: json!({
            "message": format!("Route {method}:{url} not found"),
            "error": "Not Found",
            "statusCode": 404,
        })
        .to_string(),
    }
}

fn media_type(content_type: &str) -> String {
    content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
}

fn parse_body(content_type: Option<&str>, body: &str) -> Result<Value, Reply> {
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
        "application/json" => serde_json::from_str(body).map_err(|_| {
            error_reply(
                400,
                "FST_ERR_CTP_INVALID_JSON_BODY",
                "Bad Request",
                "Body is not valid JSON but content-type is set to 'application/json'",
            )
        }),
        "text/plain" => Ok(Value::String(body.into())),
        _ => Err(error_reply(
            415,
            "FST_ERR_CTP_INVALID_MEDIA_TYPE",
            "Unsupported Media Type",
            &format!("Unsupported Media Type: {content_type}"),
        )),
    }
}

fn question_of(body: &Value) -> Result<String, Reply> {
    let Some(fields) = body.as_object() else {
        return Err(validation_error("body must be object"));
    };
    let Some(question) = fields.get("question") else {
        return Err(validation_error(
            "body must have required property 'question'",
        ));
    };
    let Some(question) = question.as_str() else {
        return Err(validation_error("body/question must be string"));
    };

    if question.chars().count() < QUESTION_MIN_LENGTH {
        return Err(validation_error(&format!(
            "body/question must NOT have fewer than {QUESTION_MIN_LENGTH} characters"
        )));
    }

    Ok(question.into())
}

fn content_type_of(request: &Request) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Content-Type"))
        .map(|header| header.value.as_str().into())
}

fn to_response(reply: Reply) -> Response<Cursor<Vec<u8>>> {
    let empty = reply.body.is_empty();
    let response = Response::from_data(reply.body.into_bytes()).with_status_code(reply.status);

    if empty {
        return response;
    }

    response.with_header(
        Header::from_bytes("Content-Type", "application/json; charset=utf-8")
            .expect("a valid header"),
    )
}

impl App {
    pub fn inject(&self, method: &str, url: &str, content_type: Option<&str>, body: &str) -> Reply {
        let path = url.split('?').next().unwrap_or_default();

        if method != "POST" || path != "/chat" {
            return route_not_found(method, url);
        }

        match parse_body(content_type, body).and_then(|value| question_of(&value)) {
            Ok(question) => self.chat(&question),
            Err(reply) => reply,
        }
    }

    fn chat(&self, question: &str) -> Reply {
        match self.router_service.generate(question) {
            Ok(response) => Reply {
                status: 200,
                body: json!(response).to_string(),
            },
            Err(error) => {
                eprintln!("Error handling /chat request: {error}");
                Reply {
                    status: 500,
                    body: String::new(),
                }
            }
        }
    }

    pub fn bind(&self, port: u16) -> Result<Server, ServerError> {
        Server::http(("0.0.0.0", port))
    }

    pub fn serve(&self, server: Server) {
        for mut request in server.incoming_requests() {
            let mut body = String::new();
            let content_type = content_type_of(&request);

            if request.as_reader().read_to_string(&mut body).is_err() {
                body.clear();
            }

            let reply = self.inject(
                request.method().as_str(),
                request.url(),
                content_type.as_deref(),
                &body,
            );

            if let Err(error) = request.respond(to_response(reply)) {
                eprintln!("Error answering the request: {error}");
            }
        }
    }
}
