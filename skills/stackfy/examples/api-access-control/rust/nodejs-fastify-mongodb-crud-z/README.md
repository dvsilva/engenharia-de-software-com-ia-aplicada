# Customers API

The customers CRUD in **Rust**, secured with JWT logins, service tokens, roles, and a rate limit per token. **axum** serves it, the official **mongodb** driver keeps the customers, **jsonwebtoken** signs and checks the JWTs, and a fixed window counted by hand limits each token, or each address without one, to 90 requests a minute. One handler runs every request through **Fastify**'s order: the token, the limit, the body, the CORS headers, and the role.

## Requirements

- **Rust** 1.88 or later
- **MongoDB** on `localhost:27017` with the user `root` and the password `example`, such as the one the lesson's `docker-compose.yml` starts

## Building

```bash
cargo build --release
```

## Running

```bash
DB_NAME=customers target/release/index
```

The API listens on `PORT`, 9999 by default, and `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` point it to another **MongoDB**. Only `GET /v1/health`, `POST /v1/auth/login`, and `POST /v1/auth/service-token` answer without a token:

```bash
curl -X POST http://localhost:9999/v1/auth/service-token \
  -H "Content-Type: application/json" \
  -d '{"username": "erickwendel", "password": "123123", "adminSuperSecret": "AM I THE BOSS?"}'

curl http://localhost:9999/v1/customers -H "Authorization: Bearer <serviceToken>"
```

The admin erickwendel, password 123123, may create, update, and delete customers, and the member ananeri, password 1234, may only read them. Service tokens live in memory, so they stop working when the API stops.
