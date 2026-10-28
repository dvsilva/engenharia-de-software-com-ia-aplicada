import os
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

from app.api.auth.route import handler as auth_handler
from app.login.page import login
from app.page import home
from lib.better_auth import BASE_PATH, Request, Response

ROOT = Path(__file__).parent

PAGES: dict[str, Callable[[Request], str]] = {'/': home, '/login': login}

ASSETS = {'/lib/auth-client.js': ROOT / 'lib' / 'auth-client.js'}


def page_response(render: Callable[[Request], str], request: Request) -> Response:
    return Response(
        200,
        render(request).encode(),
        [('content-type', 'text/html; charset=utf-8')],
    )


def asset_response(path: Path) -> Response:
    return Response(
        200, path.read_bytes(), [('content-type', 'text/javascript; charset=utf-8')]
    )


def route(request: Request) -> Response:
    if request.path.startswith(f'{BASE_PATH}/'):
        return auth_handler(request)

    if request.method == 'GET' and request.path in PAGES:
        return page_response(PAGES[request.path], request)

    if request.method == 'GET' and request.path in ASSETS:
        return asset_response(ASSETS[request.path])

    return Response(404, b'Not found', [('content-type', 'text/plain')])


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.answer()

    def do_POST(self) -> None:
        self.answer()

    def answer(self) -> None:
        address = urlsplit(self.path)
        length = int(self.headers.get('content-length') or 0)
        request = Request(
            method=self.command,
            path=address.path,
            query=dict(parse_qsl(address.query)),
            headers={name.lower(): value for name, value in self.headers.items()},
            body=self.rfile.read(length),
            client_address=self.client_address[0],
        )
        response = route(request)

        self.send_response(response.status)
        for name, value in response.headers:
            self.send_header(name, value)
        self.send_header('content-length', str(len(response.body)))
        self.end_headers()
        self.wfile.write(response.body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    port = int(os.environ.get('PORT', '3000'))
    server = ThreadingHTTPServer(('', port), Handler)

    print(f'Ready on http://localhost:{port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
