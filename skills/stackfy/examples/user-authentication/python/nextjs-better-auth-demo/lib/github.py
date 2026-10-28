import json
from dataclasses import dataclass
from typing import Any
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SCOPES = 'read:user user:email'

USER_AGENT = 'better-auth'


@dataclass(frozen=True)
class Profile:
    account_id: str
    name: str
    email: str | None
    email_verified: bool
    image: str | None


def primary_email(emails: list[dict[str, Any]]) -> str | None:
    primary = next((entry for entry in emails if entry.get('primary')), None)
    chosen = primary or (emails[0] if emails else None)

    return chosen.get('email') if chosen else None


class GitHubProvider:
    id = 'github'

    def __init__(
        self, client_id: str, client_secret: str, server_url: str, api_url: str
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.server_url = server_url.rstrip('/')
        self.api_url = api_url.rstrip('/')

    def authorization_url(
        self, state: str, code_challenge: str, redirect_uri: str
    ) -> str:
        query = urlencode(
            {
                'response_type': 'code',
                'client_id': self.client_id,
                'state': state,
                'scope': SCOPES,
                'redirect_uri': redirect_uri,
                'code_challenge_method': 'S256',
                'code_challenge': code_challenge,
            }
        )

        return f'{self.server_url}/login/oauth/authorize?{query}'

    def exchange_code(
        self, code: str, code_verifier: str, redirect_uri: str
    ) -> str | None:
        form = urlencode(
            {
                'grant_type': 'authorization_code',
                'code': code,
                'code_verifier': code_verifier,
                'redirect_uri': redirect_uri,
                'client_id': self.client_id,
                'client_secret': self.client_secret,
            }
        ).encode()
        request = Request(
            f'{self.server_url}/login/oauth/access_token',
            data=form,
            method='POST',
            headers={
                'accept': 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
            },
        )
        answer = read_json(request)

        if not isinstance(answer, dict):
            return None

        token = answer.get('access_token')
        return token if isinstance(token, str) else None

    def user_info(self, access_token: str) -> Profile | None:
        profile = self.read_api('/user', access_token)

        if not isinstance(profile, dict):
            return None

        listed = self.read_api('/user/emails', access_token)
        emails = listed if isinstance(listed, list) else []
        email = profile.get('email') or primary_email(emails)
        verified = any(
            entry.get('email') == email and entry.get('verified') is True
            for entry in emails
        )

        return Profile(
            account_id=str(profile['id']),
            name=profile.get('name') or profile['login'],
            email=email,
            email_verified=verified,
            image=profile.get('avatar_url'),
        )

    def read_api(self, path: str, access_token: str) -> Any:
        request = Request(
            f'{self.api_url}{path}',
            headers={
                'authorization': f'Bearer {access_token}',
                'user-agent': USER_AGENT,
            },
        )

        return read_json(request)


def read_json(request: Request) -> Any:
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except (URLError, ValueError):
        return None
