import asyncio
import json
import sys
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import cast

from langchain_core.messages import HumanMessage

from graph.factory import build_graph
from graph.state import GraphState

MINIMUM_QUESTION_LENGTH = 10

JSON_TYPE = "application/json"

TEXT_TYPE = "text/plain"


@dataclass(frozen=True)
class Reply:
    status: int
    body: str
    content_type: str = JSON_TYPE


class RequestError(Exception):
    def __init__(self, status: int, error: str, message: str) -> None:
        super().__init__(message)
        self.reply = Reply(
            status,
            json.dumps(
                {"statusCode": status, "error": error, "message": message},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        )


graph = build_graph()

graph_loop = asyncio.new_event_loop()

threading.Thread(target=graph_loop.run_forever, daemon=True).start()


def run_graph(question: str) -> GraphState:
    running = asyncio.run_coroutine_threadsafe(
        graph.ainvoke({"messages": [HumanMessage(question)]}), graph_loop
    )
    return cast(GraphState, running.result())


def parse_body(content_type: str | None, raw_body: bytes) -> object:
    if content_type is None:
        if raw_body:
            raise RequestError(415, "Unsupported Media Type", "Unsupported Media Type")
        return None

    media_type = content_type.split(";")[0].strip().lower()
    if media_type == TEXT_TYPE:
        return raw_body.decode()
    if media_type != JSON_TYPE:
        raise RequestError(
            415, "Unsupported Media Type", f"Unsupported Media Type: {media_type}"
        )
    if not raw_body:
        raise RequestError(
            400,
            "Bad Request",
            "Body cannot be empty when content-type is set to 'application/json'",
        )

    try:
        return json.loads(raw_body)
    except json.JSONDecodeError as error:
        raise RequestError(400, "Bad Request", str(error)) from error


def read_question(body: object) -> str:
    if not isinstance(body, dict):
        raise RequestError(400, "Bad Request", "body must be object")

    question = body.get("question")
    if question is None:
        raise RequestError(
            400, "Bad Request", "body must have required property 'question'"
        )
    if not isinstance(question, str):
        raise RequestError(400, "Bad Request", "body/question must be string")
    if len(question) < MINIMUM_QUESTION_LENGTH:
        raise RequestError(
            400,
            "Bad Request",
            f"body/question must NOT have fewer than {MINIMUM_QUESTION_LENGTH} characters",
        )

    return question


def answer(method: str, path: str, content_type: str | None, raw_body: bytes) -> Reply:
    if method != "POST" or path != "/chat":
        return RequestError(404, "Not Found", f"Route {method}:{path} not found").reply

    try:
        question = read_question(parse_body(content_type, raw_body))
    except RequestError as error:
        return error.reply

    try:
        state = run_graph(question)
    except Exception as error:
        print("❌ Error processing request:", error, file=sys.stderr)
        return Reply(
            500,
            json.dumps({"error": "An error occurred while processing your request."}),
        )

    messages = state["messages"]
    text = messages[-1].text if messages else "No response generated."

    return Reply(200, text, TEXT_TYPE)


def inject(method: str, path: str, payload: object) -> Reply:
    return answer(method, path, JSON_TYPE, json.dumps(payload).encode())


class ChatHandler(BaseHTTPRequestHandler):
    def route(self) -> None:
        length = int(self.headers.get("content-length") or 0)
        reply = answer(
            self.command,
            self.path,
            self.headers.get("content-type"),
            self.rfile.read(length),
        )
        encoded = reply.body.encode()

        self.send_response(reply.status)
        self.send_header("content-type", f"{reply.content_type}; charset=utf-8")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = route

    def log_message(self, format: str, *args: object) -> None:
        return


def create_server(port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("0.0.0.0", port), ChatHandler)
