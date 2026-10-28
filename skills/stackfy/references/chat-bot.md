---
name: chat-bot
description: A bot that joins a chat workspace, receives its messages as events, and answers in the channel, as the course does with a Slack bot in Socket Mode that turns messages carrying a trigger into Jira cards through an LLM parser.
---

# Chat bot

## Concept

A chat bot is a program that a workspace treats as a member. The platform delivers what happens in the bot's channels as events, such as a new message, and the bot answers through the platform's Web API with its bot token. **Slack** delivers events in two ways: over HTTP, posting each one to a public URL the app exposes, or in Socket Mode, where the app opens a WebSocket to **Slack** and needs no public address. In Socket Mode, the app asks apps.connections.open for a WebSocket address with its app-level token, connects, and waits for a hello message. Each event then arrives inside an envelope that the app acknowledges by sending the envelope's id back within three seconds, or **Slack** delivers it again. A framework such as **Bolt** hides the envelopes behind listeners that match messages by a pattern, a say function that answers in the event's channel, and filters such as skipping the bot's own messages. A bot like this connects the chat to other tools, here an issue tracker.

## How the course implements it

The ecosystem automation lesson of the project management module holds ecosystem-bot-template.js, a **Slack** to **Jira** bot, beside a system prompt, sample outputs, a setup guide, and a **Make.com** blueprint that leave nothing to transcribe. The guide's **Node.js** option describes HTTP events with a signing secret and a **Gemini** key, while the code uses Socket Mode and **Claude**, so the cases follow the code.

The bot uses **@slack/bolt** in Socket Mode with SLACK_BOT_TOKEN and SLACK_APP_TOKEN, loads a .env file with **dotenv**, and listens for messages that contain card: anywhere. For each one, it removes the first card:, trims the rest, and then:

1. Says ⏳ Processando: with the text in italics and quotes.
2. Asks claude-sonnet-4-6 to parse the text into a card ([llm-http-api](llm-http-api.md)) with a type (bug, task, story, or spike), a title, a priority (highest, high, medium, or low), and the component, assignee, requester, due date, region, reason, description, required action, and confidence.
3. Says a confirmation with the type, the title, the priority, the assignee or [A DEFINIR], the due date or [A DEFINIR], the component or não identificado, an Atenção line when an action is required, and the parser's confidence. It never waits for a reply, which the code leaves to production.
4. Creates the issue with a POST to /rest/api/3/issue on JIRA_BASE_URL through **axios**, with Basic credentials from JIRA_EMAIL and JIRA_API_TOKEN, in the project JIRA_PROJECT_KEY or ROUTEWISE. The summary is the title, and the description is an Atlassian Document Format document with one paragraph holding one text node: the parsed description, then Motivação, Ação necessária, and Assignee não resolvido blocks when they apply, and a footer with the author's **Slack** user id and the original text, each block after a blank line. A bug becomes the Bug issue type, a spike becomes a Task, and anything else becomes a Story, task included. Priorities map to Highest, High, Medium, and Low, with Medium for anything else. The assignee's name is lowercased, trimmed, and looked up among carlos, priya, and marcus, whose accountIds are placeholders. Only a match adds the assignee field, and a name without a match adds the unresolved block.
5. Says ✅ Card criado: with a link to the card under JIRA_BASE_URL/browse, the title, the priority and the type, a warning when no assignee was resolved, a missing one included, and the required action when there is one.

Any failure, from the LLM, the JSON, **Jira**, or **Slack**, prints Erro no NL to Workflow: and the error to standard error and says ❌ Não foi possível processar a mensagem. Erro: with the error's message, followed by a line asking for a manual card. Once connected, the bot prints the trigger, the notification channel #routewise, and the project key. handleJiraWebhook posts an issue's status change to #routewise for a jira:issue_updated event, but no route or listener calls it, and the module only exports it beside the parser and the card creation.

## What usually goes wrong in other languages

- The original's **Slack** client always calls https://slack.com/api/. Transcriptions read SLACK_API_URL and fall back to that address, as the copy that produced the cases does, which is how verification points them to the replay. Every **Slack** SDK takes the address as an option: slackApiUrl among **Bolt**'s client options, base_url in **Python**'s WebClient, and OptionAPIURL in **slack-go**.
- apps.connections.open takes the app-level token, which starts with xapp-, and every other call takes the bot token, which starts with xoxb-. The cases answer apps.connections.open only for the app token.
- **Bolt** acknowledges each envelope before the listener runs, so a slow LLM call never makes **Slack** deliver the event again. Libraries without listeners, such as **slack-go**, leave the acknowledgement to the program, which sends it before the work, and the cases check it.
- **Bolt** skips the bot's own messages by the user and bot ids that auth.test returns. A bot on a lower-level library filters them itself, or it may answer its own replies.
- The trigger matches anywhere in the text and is case-sensitive, so Card: is ignored. **JavaScript**'s replace with a text removes only the first card:, which the cases check with a message that quotes the trigger, while **Python**'s str.replace removes every one unless given a count of 1, and **Go**'s strings.Replace needs n set to 1.
- **JavaScript**'s || treats null, a missing field, and an empty text alike, so the confirmation shows [A DEFINIR] for any of them. Typed languages decode null into an empty value or an optional and handle both.
- A task becomes a Story in **Jira**, and only a spike becomes a Task, which a transcription that maps types by name gets wrong.
- The **Jira** description is a single text node, so the Markdown asterisks and the line breaks are literal text inside it.
- **axios** rejects any status outside 2xx, which turns a **Jira** error into the error reply. **requests** and net/http return the response instead, so a transcription checks the status itself. The error's text depends on the client, and **axios** says Request failed with status code 400.
- **Bolt** for **JavaScript** and **slack-go** post form-encoded fields, and **Python**'s client posts JSON. The cases compare only the channel and the text, in either encoding.
- The replies carry emoji, ⚠️ with its variation selector included, and the cases compare them exactly.
- **dotenv** 18 prints how many variables it injected to standard error, which the cases ignore, and earlier versions printed to standard output before the startup lines, which the cases allow.
- **Slack**'s **JavaScript** client pings the socket every five seconds and reconnects when no pong comes back. The replay answers pings.

## How close common targets get

| Target                            | Fit               | Library                                                                                                   |
| --------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| **JavaScript** and **TypeScript** | Direct equivalent | **@slack/bolt** in Socket Mode, with fetch for **Jira**                                                   |
| **Python**                        | Direct equivalent | **slack_bolt** with its SocketModeHandler, and **requests** for **Jira**                                  |
| **Java**                          | Direct equivalent | **Bolt for Java** with its Socket Mode module, and the built-in HTTP client with **Jackson** for **Jira** |
| **Go**                            | Substitute        | **slack-go** with its socketmode package, acknowledging and filtering by hand, and net/http for **Jira**  |
| **Rust**                          | Substitute        | **slack-morphism** with its Socket Mode listener, and **reqwest** with **serde_json** for **Jira**        |
| **C#**                            | Substitute        | **SlackNet** in Socket Mode, and HttpClient with System.Text.Json for **Jira**                            |
| **C++**                           | Substitute        | **IXWebSocket** for the socket, **libcurl** for the Web API and **Jira**, and **nlohmann/json**           |

A tested **Go** transcription exists.

## Tolerance

The bot is deterministic once the LLM's answer is fixed, so the cases replay recorded answers and compare every **Slack** message, the LLM request, and the **Jira** issue exactly, in order. Only the address in the card's link and the error's text after a failed **Jira** call vary, and the cases accept any. Every **Slack** and **Jira** response is synthesized from their documented formats.

## Where it appears

- modulo07-ferramentas-de-ia-para-gestao-de-projetos/modulo-09-automacao-de-ecossistema (a **Slack** bot in Socket Mode that creates **Jira** cards)
