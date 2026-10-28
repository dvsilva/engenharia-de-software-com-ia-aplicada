import base64
import hashlib
import hmac
import html
import json
import secrets
import sqlite3
import string
from collections.abc import Callable, Mapping
from contextlib import closing
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote, unquote

from lib.github import GitHubProvider, Profile

ALPHABET = string.ascii_letters + string.digits + '-_'

BASE_PATH = '/api/auth'

COOKIE_PREFIX = 'better-auth'

STATE_COOKIE_AGE = 300

STATE_LIFETIME = timedelta(minutes=10)

SESSION_LIFETIME = timedelta(days=7)

SESSION_COOKIES = ('session_token', 'session_data', 'dont_remember')


@dataclass(frozen=True)
class Request:
    method: str
    path: str
    query: Mapping[str, str]
    headers: Mapping[str, str]
    body: bytes
    client_address: str


@dataclass
class Response:
    status: int
    body: bytes = b''
    headers: list[tuple[str, str]] = field(default_factory=list)


def random_string(length: int) -> str:
    return ''.join(secrets.choice(ALPHABET) for _ in range(length))


def code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()

    return base64.urlsafe_b64encode(digest).decode().rstrip('=')


def timestamp(moment: datetime) -> str:
    return moment.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def parse_timestamp(text: str) -> datetime:
    return datetime.fromisoformat(text.replace('Z', '+00:00'))


def json_response(
    status: int, value: Any, cookies: list[str] | None = None
) -> Response:
    headers = [('content-type', 'application/json')]
    headers += [('set-cookie', cookie) for cookie in cookies or []]

    return Response(status, json.dumps(value).encode(), headers)


def api_error(status: int, code: str, message: str) -> Response:
    return json_response(status, {'code': code, 'message': message})


def read_cookies(request: Request) -> dict[str, str]:
    pairs = (
        part.strip().partition('=')
        for part in request.headers.get('cookie', '').split(';')
    )

    return {name: value for name, _, value in pairs if name}


def cookie_header(name: str, value: str, max_age: int) -> str:
    return f'{COOKIE_PREFIX}.{name}={value}; Max-Age={max_age}; Path=/; HttpOnly; SameSite=Lax'


def expired_cookie(name: str) -> str:
    return cookie_header(name, '', 0)


def read_json_body(request: Request) -> tuple[Any, Response | None]:
    content_type = request.headers.get('content-type', '')

    if not content_type.startswith('application/json'):
        return None, api_error(
            415,
            'UNSUPPORTED_MEDIA_TYPE',
            'Content-Type is required. Allowed types: application/json',
        )

    try:
        return json.loads(request.body or b'{}'), None
    except ValueError:
        return None, api_error(400, 'VALIDATION_ERROR', 'Invalid JSON body')


def session_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        'session': {
            'expiresAt': row['expiresAt'],
            'token': row['token'],
            'createdAt': row['sessionCreatedAt'],
            'updatedAt': row['sessionUpdatedAt'],
            'ipAddress': row['ipAddress'],
            'userAgent': row['userAgent'],
            'userId': row['userId'],
            'id': row['sessionId'],
        },
        'user': {
            'name': row['name'],
            'email': row['email'],
            'emailVerified': bool(row['emailVerified']),
            'image': row['image'],
            'createdAt': row['userCreatedAt'],
            'updatedAt': row['userUpdatedAt'],
            'id': row['userId'],
        },
    }


SESSION_QUERY = '''
SELECT s."id" AS sessionId, s."token", s."expiresAt", s."createdAt" AS sessionCreatedAt,
       s."updatedAt" AS sessionUpdatedAt, s."ipAddress", s."userAgent", s."userId",
       u."name", u."email", u."emailVerified", u."image",
       u."createdAt" AS userCreatedAt, u."updatedAt" AS userUpdatedAt
FROM "session" s JOIN "user" u ON u."id" = s."userId"
WHERE s."token" = ?
'''


class BetterAuth:
    def __init__(
        self,
        database: str,
        github: GitHubProvider,
        base_url: str | None,
        secret: str,
    ) -> None:
        self.database = database
        self.providers = {github.id: github}
        self.base_url = base_url.rstrip('/') if base_url else None
        self.secret = secret.encode()
        self.routes: dict[tuple[str, str], Callable[[Request], Response]] = {
            ('GET', '/get-session'): self.get_session_route,
            ('POST', '/sign-in/social'): self.sign_in_social,
            ('POST', '/sign-out'): self.sign_out,
            ('GET', '/error'): self.error_page,
            ('GET', f'/callback/{github.id}'): self.callback,
        }

    def handler(self, request: Request) -> Response:
        route = self.routes.get(
            (request.method, request.path.removeprefix(BASE_PATH))
        )

        if route is None:
            return Response(404)

        return route(request)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys = ON')

        return connection

    def origin(self, request: Request) -> str:
        return self.base_url or f'http://{request.headers.get("host", "localhost")}'

    def endpoint(self, request: Request, path: str) -> str:
        return f'{self.origin(request)}{BASE_PATH}{path}'

    def sign(self, value: str) -> str:
        digest = hmac.new(self.secret, value.encode(), hashlib.sha256).digest()
        signature = base64.b64encode(digest).decode()

        return quote(f'{value}.{signature}', safe='')

    def unsign(self, signed: str | None) -> str | None:
        if not signed:
            return None

        value, _, signature = unquote(signed).rpartition('.')
        expected = unquote(self.sign(value)).rpartition('.')[2]

        return value if hmac.compare_digest(signature, expected) else None

    def signed_cookie(self, request: Request, name: str) -> str | None:
        return self.unsign(read_cookies(request).get(f'{COOKIE_PREFIX}.{name}'))

    def redirect_to_error(self, request: Request, error: str) -> Response:
        location = f'{self.endpoint(request, "/error")}?error={quote(error)}'

        return Response(302, headers=[('location', location)])

    def get_session(self, request: Request) -> dict[str, Any] | None:
        token = self.signed_cookie(request, 'session_token')

        if token is None:
            return None

        with closing(self.connect()) as database:
            row = database.execute(SESSION_QUERY, (token,)).fetchone()

        if row is None or parse_timestamp(row['expiresAt']) <= datetime.now(
            timezone.utc
        ):
            return None

        return session_json(row)

    def get_session_route(self, request: Request) -> Response:
        return json_response(200, self.get_session(request))

    def sign_in_social(self, request: Request) -> Response:
        body, failure = read_json_body(request)

        if failure:
            return failure

        provider_id = body.get('provider') if isinstance(body, dict) else None

        if not isinstance(provider_id, str):
            return api_error(
                400, 'VALIDATION_ERROR', '[body.provider] Invalid input'
            )

        provider = self.providers.get(provider_id)

        if provider is None:
            return api_error(404, 'PROVIDER_NOT_FOUND', 'Provider not found')

        now = datetime.now(timezone.utc)
        state = random_string(32)
        verifier = random_string(128)
        callback_url = body.get('callbackURL') or self.origin(request)
        stored = {
            'callbackURL': callback_url,
            'codeVerifier': verifier,
            'expiresAt': int((now + STATE_LIFETIME).timestamp() * 1000),
        }

        with closing(self.connect()) as database:
            database.execute(
                'INSERT INTO "verification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
                (
                    random_string(32),
                    state,
                    json.dumps(stored),
                    timestamp(now + STATE_LIFETIME),
                    timestamp(now),
                    timestamp(now),
                ),
            )

        url = provider.authorization_url(
            state=state,
            code_challenge=code_challenge(verifier),
            redirect_uri=self.endpoint(request, f'/callback/{provider.id}'),
        )
        cookie = cookie_header('state', self.sign(state), STATE_COOKIE_AGE)

        return json_response(200, {'url': url, 'redirect': True}, [cookie])

    def consume_state(self, request: Request, state: str) -> dict[str, Any] | str:
        with closing(self.connect()) as database:
            row = database.execute(
                'SELECT "id", "value", "expiresAt" FROM "verification" WHERE "identifier" = ?',
                (state,),
            ).fetchone()

            if row is None or parse_timestamp(row['expiresAt']) <= datetime.now(
                timezone.utc
            ):
                return 'please_restart_the_process'

            if self.signed_cookie(request, 'state') != state:
                return 'state_mismatch'

            database.execute('DELETE FROM "verification" WHERE "id" = ?', (row['id'],))

        stored: dict[str, Any] = json.loads(row['value'])
        return stored

    def callback(self, request: Request) -> Response:
        provider = self.providers['github']
        stored = self.consume_state(request, request.query.get('state', ''))

        if isinstance(stored, str):
            return self.redirect_to_error(request, stored)

        if 'error' in request.query:
            return self.redirect_to_error(request, request.query['error'])

        redirect_uri = self.endpoint(request, f'/callback/{provider.id}')
        access_token = provider.exchange_code(
            request.query.get('code', ''), stored['codeVerifier'], redirect_uri
        )

        if access_token is None:
            return self.redirect_to_error(request, 'invalid_code')

        profile = provider.user_info(access_token)

        if profile is None or not profile.email:
            return self.redirect_to_error(request, 'email_not_found')

        token = self.open_session(request, provider.id, profile, access_token)

        return Response(
            302,
            headers=[
                ('location', stored['callbackURL']),
                ('set-cookie', expired_cookie('state')),
                (
                    'set-cookie',
                    cookie_header(
                        'session_token',
                        self.sign(token),
                        int(SESSION_LIFETIME.total_seconds()),
                    ),
                ),
            ],
        )

    def open_session(
        self, request: Request, provider_id: str, profile: Profile, access_token: str
    ) -> str:
        now = timestamp(datetime.now(timezone.utc))
        token = random_string(32)

        with closing(self.connect()) as database:
            user_id = self.find_or_create_user(
                database, provider_id, profile, access_token, now
            )
            database.execute(
                'INSERT INTO "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (
                    random_string(32),
                    timestamp(datetime.now(timezone.utc) + SESSION_LIFETIME),
                    token,
                    now,
                    now,
                    request.client_address,
                    request.headers.get('user-agent', ''),
                    user_id,
                ),
            )

        return token

    def find_or_create_user(
        self,
        database: sqlite3.Connection,
        provider_id: str,
        profile: Profile,
        access_token: str,
        now: str,
    ) -> str:
        linked = database.execute(
            'SELECT "userId" FROM "account" WHERE "providerId" = ? AND "accountId" = ?',
            (provider_id, profile.account_id),
        ).fetchone()

        if linked is not None:
            database.execute(
                'UPDATE "account" SET "accessToken" = ?, "updatedAt" = ? WHERE "providerId" = ? AND "accountId" = ?',
                (access_token, now, provider_id, profile.account_id),
            )
            return str(linked['userId'])

        email = (profile.email or '').lower()
        existing = database.execute(
            'SELECT "id" FROM "user" WHERE "email" = ?', (email,)
        ).fetchone()
        user_id = str(existing['id']) if existing else random_string(32)

        if existing is None:
            database.execute(
                'INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
                (
                    user_id,
                    profile.name,
                    email,
                    int(profile.email_verified),
                    profile.image,
                    now,
                    now,
                ),
            )

        database.execute(
            'INSERT INTO "account" ("id", "accountId", "providerId", "userId", "accessToken", "scope", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (
                random_string(32),
                profile.account_id,
                provider_id,
                user_id,
                access_token,
                'read:user,user:email',
                now,
                now,
            ),
        )

        return user_id

    def sign_out(self, request: Request) -> Response:
        _, failure = read_json_body(request)

        if failure:
            return failure

        token = self.signed_cookie(request, 'session_token')

        if token is not None:
            with closing(self.connect()) as database:
                database.execute('DELETE FROM "session" WHERE "token" = ?', (token,))

        cookies = [expired_cookie(name) for name in SESSION_COOKIES]

        return json_response(200, {'success': True}, cookies)

    def error_page(self, request: Request) -> Response:
        error = html.escape(request.query.get('error', 'unknown'))
        page = f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Error</title></head><body><h1>Error</h1><p>{error}</p></body></html>'

        return Response(
            200, page.encode(), [('content-type', 'text/html; charset=utf-8')]
        )
