# Next.js + Better Auth demo in Python

Sign-in through **GitHub** OAuth with sessions in SQLite, written in **Python** with the standard library only. The server answers the same /api/auth routes **Better Auth** answers for the original, and renders the home and login pages itself, each with a small module script that calls those routes.

## Requirements

- **Python** 3.12 or later
- A **GitHub** OAuth app whose callback URL is `http://localhost:3000/api/auth/callback/github`

## Setup

```bash
export GITHUB_CLIENT_ID=your_client_id
export GITHUB_CLIENT_SECRET=your_client_secret
export BETTER_AUTH_URL=http://localhost:3000
export BETTER_AUTH_SECRET=a_long_random_secret
python3 migrate.py
```

The migration creates better-auth.sqlite with the user, session, account, and verification tables, and running it again changes nothing.

## Running

```bash
python3 server.py
```

The server listens on `http://localhost:3000`, or on the port in `PORT`. `GITHUB_SERVER_URL` and `GITHUB_API_URL` replace `https://github.com` and `https://api.github.com`.

The pages load **Tailwind CSS**'s browser build from **jsDelivr**, so they keep the original's utility classes without a build step.
