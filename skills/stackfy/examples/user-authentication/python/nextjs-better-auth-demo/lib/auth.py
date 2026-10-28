import os

from lib.better_auth import BetterAuth
from lib.github import GitHubProvider

DEVELOPMENT_SECRET = 'better-auth-development-secret-0123456789'

auth = BetterAuth(
    database='./better-auth.sqlite',
    github=GitHubProvider(
        client_id=os.environ.get('GITHUB_CLIENT_ID', ''),
        client_secret=os.environ.get('GITHUB_CLIENT_SECRET', ''),
        server_url=os.environ.get('GITHUB_SERVER_URL', 'https://github.com'),
        api_url=os.environ.get('GITHUB_API_URL', 'https://api.github.com'),
    ),
    base_url=os.environ.get('BETTER_AUTH_URL'),
    secret=os.environ.get('BETTER_AUTH_SECRET', DEVELOPMENT_SECRET),
)
