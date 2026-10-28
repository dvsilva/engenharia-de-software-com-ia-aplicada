---
name: user-authentication
description: Signing users in through an identity provider with the OAuth authorization code flow, keeping each session in a database behind an HttpOnly cookie, and signing out, as the course does with Better Auth, GitHub, and SQLite in Next.js.
---

# User authentication

## Concept

Authentication proves who the user is. Instead of keeping passwords, an application can hand the proof to an identity provider such as **GitHub** through OAuth's authorization code flow: the application sends the browser to the provider's authorize address with its client id, the scopes it needs, the address to come back to, and a random state. The provider asks the user, then sends the browser back with a one-time code and the same state. The application checks that state against the one it stored for that browser, so no other site can finish a sign-in for it, exchanges the code and its client secret for an access token, and reads the user's profile with that token. PKCE adds a secret verifier whose hash goes with the first redirect, so a stolen code is useless without it. The application then creates or finds the user, opens a session that expires, stores it in a database, and gives the browser a cookie holding the session's token, HttpOnly so no script can read it. Every later request carries the cookie, and signing out deletes the session and clears the cookie. An API that programs call proves who is calling with a bearer token instead ([api-access-control](api-access-control.md)).

## How the course implements it

The Context7 lesson of module 1 holds nextjs-better-auth-demo, a **Next.js** application an assistant generated from the lesson's prompt ([coding-agent-harness](coding-agent-harness.md)), whose authentication is **Better Auth** 1.4 with **GitHub** as its only social provider. lib/auth.ts creates the server instance with a **better-sqlite3** connection to ./better-auth.sqlite ([sql-database](sql-database.md)) and the client id and secret from GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET. The base URL comes from BETTER_AUTH_URL and the signing secret from BETTER_AUTH_SECRET, which **Better Auth** reads itself. app/api/auth/[...all]/route.ts turns the instance into the GET and POST handlers of every path under /api/auth with toNextJsHandler, and lib/auth-client.ts creates the **React** client, which calls the same origin. The pages that use it follow [component-framework](component-framework.md).

The pages need four of the routes **Better Auth** serves:

- POST /api/auth/sign-in/social, with the provider and the callback URL as JSON, stores a state of 32 characters and a PKCE verifier of 128 with the callback URL in the verification table for ten minutes, sets the state in a signed, HttpOnly better-auth.state cookie, and answers 200 with redirect true and the url of **GitHub**'s authorize page, carrying response_type code, the client id, the state, the scopes read:user and user:email, the redirect_uri {base URL}/api/auth/callback/github, and an S256 code challenge. The client then sets the page's location to that url. An unknown provider answers 404 with the code PROVIDER_NOT_FOUND and the message Provider not found, and a missing one 400 with the code VALIDATION_ERROR.
- GET /api/auth/callback/github, where **GitHub** sends the browser back, requires a stored state that matches the state cookie, or redirects to **Better Auth**'s error page. It posts the code, the verifier, the redirect_uri, the client id, and the secret as a form to https://github.com/login/oauth/access_token, asking for JSON, then reads https://api.github.com/user and https://api.github.com/user/emails with the token as a bearer and the user agent better-auth. The email is the profile's, or else the primary address in the list, or else the first, and it counts as verified when its entry in the list says so. The name is the profile's name, or else its login, and the image is its avatar. A new user gets a row in user and one in account, keyed by the provider github and the **GitHub** id, with the access token and the scopes, while a known one is signed in again. The session lasts seven days and keeps the IP address and the user agent. The answer clears the state cookie, sets better-auth.session_token to the session's token followed by its HMAC, HttpOnly and SameSite Lax for seven days, and redirects 302 to the callback URL.
- GET /api/auth/get-session answers the session and its user as JSON, or null when the cookie is missing, forged, or expired.
- POST /api/auth/sign-out deletes the session, clears the session cookies, and answers success true, even without a session.

## What usually goes wrong in other languages

- No other language has **Better Auth**, so a transcription writes the four routes itself, with the same paths, JSON bodies, and error codes, because the pages, and the cases, call them.
- The original always uses https://github.com and https://api.github.com. Transcriptions read GITHUB_SERVER_URL and GITHUB_API_URL first, the names **GitHub Actions** gives those addresses, and fall back to them, as the copy that produced the cases does. The cases point both to the replay only for the sign-in, and check that the authorize address is **GitHub**'s otherwise.
- BETTER_AUTH_URL decides the redirect_uri, and the state cookie only reaches the callback on the same host. Without it, **Better Auth** takes the address from the request, which **Next.js**'s dev server reports as localhost even when the browser opened 127.0.0.1, so the cases set it to the address they open, and a transcription builds the redirect_uri from it.
- **GitHub** returns the token form encoded unless the request accepts JSON. The replay answers both ways, but a client that never sends an Accept header must parse the form.
- **GitHub** gives a null email in the profile when the address is private, as it is for the cases' user, whose primary address comes second in the list. A transcription always reads the list of emails and chooses the primary address.
- The session cookie must be HttpOnly, so the cases check that the page's document.cookie is empty after signing in. They also check that the session lasts seven whole days and that a forged cookie gets null.
- get-session answers the JSON literal null without a session, not 401 and not an empty body. **FastAPI** returning None, **Go**'s json.Marshal of nil, and serde_json's Value::Null all write null.
- The state must be checked against the cookie of the browser that started the sign-in, not only against the stored row, or another site can finish a sign-in in the user's browser. The cases cannot see that difference, so it is up to the transcription.
- **Better Auth** posts the client secret in the body, while some OAuth libraries send it with HTTP Basic authentication, so the cases only check that the code reaches the token endpoint.
- sign-out answers 415 without a JSON content type, which the client always sends. The cases send JSON.
- The account row keeps **GitHub**'s access token as plain text, and the lesson's folder commits better-auth.sqlite with its author's own sign-in. A transcription keeps the database out of version control.

## How close common targets get

| Target                            | Fit               | Library                                                                                      |
| --------------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| **JavaScript** and **TypeScript** | Direct equivalent | **Better Auth** with **better-sqlite3**, mounted in **Next.js**, **Nuxt**, or **SvelteKit**  |
| **Python**                        | Direct equivalent | http.server, urllib.request, hmac, secrets, and sqlite3 from the standard library            |
| **Go**                            | Direct equivalent | net/http with **golang.org/x/oauth2** and database/sql with **modernc.org/sqlite**           |
| **Rust**                          | Direct equivalent | **axum** with the **oauth2** crate, **reqwest**, and **rusqlite**                            |
| **C#**                            | Direct equivalent | ASP.NET Core minimal APIs with HttpClient and **Microsoft.Data.Sqlite**                      |
| **Java**                          | Direct equivalent | The JDK's HttpServer and HTTP client with **sqlite-jdbc** and **Jackson**                    |
| **C++**                           | Direct equivalent | **cpp-httplib** with **OpenSSL** as client and server, **nlohmann/json**, and SQLite's C API |

Every target outside **JavaScript** writes the four routes itself, since sign-in frameworks such as **Spring Security**'s OAuth client bring routes and cookies of their own. The flow is three HTTP requests, so an OAuth client library is optional, and the **Python** and **C++** rows build the authorize address and the token request by hand. The tested **Python** transcription renders the two pages on the server, each with a small module script that calls the routes as the original's auth client does ([component-framework](component-framework.md)).

## Tolerance

The state, the verifier, the tokens, the ids, and the dates are random or depend on the clock, so the cases check the authorize address by its parameters in any order, the signed-in user by its fields, and the session's lifetime in whole days. Every **GitHub** response is synthesized from its documented format, and the authorize page stands for a user who already approved the app: a script that sends the browser back to the redirect_uri with a fixed code and the state it received.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-08-context7/nextjs-better-auth-demo
