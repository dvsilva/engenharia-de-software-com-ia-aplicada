# modulo-09-automacao-de-ecossistema

The NL to Workflow bot in **Go**: a **Slack** bot in Socket Mode that turns messages with `card:` into **Jira** cards through **Claude**, confirming each step in the channel.

## Requirements

- **Go** 1.27 or later
- A **Slack** app with Socket Mode, a **Jira Cloud** site, and an **Anthropic** API key

## Building

```bash
go build -o bin/ecosystem-bot .
```

## Running

Set the same variables as the original, in the environment or in a `.env` file:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
ANTHROPIC_API_KEY=sk-ant-...
JIRA_BASE_URL=https://seu-workspace.atlassian.net
JIRA_EMAIL=seu@email.com
JIRA_API_TOKEN=...
JIRA_PROJECT_KEY=ROUTEWISE
```

```bash
bin/ecosystem-bot
```

`SLACK_API_URL` changes the **Slack** Web API's address, and `ANTHROPIC_BASE_URL` the **Anthropic** API's. **slack-go** has no listener for a trigger word, so the bot acknowledges every Events API envelope itself, skips its own messages with the identity `auth.test` returns, and runs each message in its own goroutine. `handleJiraWebhook` posts a status change to `#routewise`, and, as in the original, nothing calls it.
