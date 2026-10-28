package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/joho/godotenv"
	"github.com/slack-go/slack"
	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"
)

type config struct {
	triggerKeyword      string
	notificationChannel string
	teamMembers         map[string]string
	projectComponents   []string
}

type parsedCard struct {
	Type           string `json:"type"`
	Title          string `json:"title"`
	Priority       string `json:"priority"`
	Component      string `json:"component"`
	Assignee       string `json:"assignee"`
	RequestedBy    string `json:"requestedBy"`
	DueDate        string `json:"dueDate"`
	Region         string `json:"region"`
	Reason         string `json:"reason"`
	Description    string `json:"description"`
	ActionRequired string `json:"actionRequired"`
	Confidence     string `json:"confidence"`
}

type jiraCard struct {
	key              string
	url              string
	assigneeResolved bool
	actionRequired   string
}

type jiraWebhookEvent struct {
	WebhookEvent string `json:"webhookEvent"`
	Issue        struct {
		Key    string `json:"key"`
		Fields struct {
			Summary string `json:"summary"`
		} `json:"fields"`
	} `json:"issue"`
	Changelog *struct {
		Items []struct {
			Field      string `json:"field"`
			FromString string `json:"fromString"`
			ToString   string `json:"toString"`
		} `json:"items"`
	} `json:"changelog"`
}

type bot struct {
	api       *slack.Client
	anthropic anthropic.Client
	botUserID string
	botID     string
}

var settings = config{
	triggerKeyword:      "card:",
	notificationChannel: "#routewise",
	teamMembers: map[string]string{
		"carlos": "accountId-carlos",
		"priya":  "accountId-priya",
		"marcus": "accountId-marcus",
	},
	projectComponents: []string{
		"alertas-velocidade",
		"score-comportamento",
		"manutencao-preditiva",
		"dashboard",
		"integracao-gps",
		"notificacoes",
	},
}

var jiraPriorities = map[string]string{
	"highest": "Highest",
	"high":    "High",
	"medium":  "Medium",
	"low":     "Low",
}

var jsonObject = regexp.MustCompile(`\{[\s\S]*\}`)

func orDefault(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func projectKey() string {
	return orDefault(os.Getenv("JIRA_PROJECT_KEY"), "ROUTEWISE")
}

func slackAPIURL() string {
	return orDefault(os.Getenv("SLACK_API_URL"), slack.APIURL)
}

func nlParserPrompt() string {
	return `
Você é um parser de linguagem natural para criação de cards no Jira. Sua função é extrair informações estruturadas de mensagens de texto em linguagem natural - como mensagens de Slack, e-mails ou anotações rápidas - e retornar um objeto JSON pronto para criação de card.

## CONTEXTO DO PROJETO
- Projeto: ` + projectKey() + ` - Sistema de Gestão de Frota
- Componentes disponíveis: alertas-velocidade, score-comportamento, manutencao-preditiva, dashboard, integracao-gps, notificacoes
- Membros do time: Carlos (Diretor de Operações), Priya (TI/Infra), Marcus (Consultor)

## MENSAGEM PARA PROCESSAR

[COLE A MENSAGEM AQUI]

## ANÁLISE SOLICITADA

Extraia as seguintes informações da mensagem e retorne um JSON:

{
  "type": "bug | task | story | spike",
  "title": "título claro e específico - máximo 80 caracteres",
  "priority": "highest | high | medium | low",
  "component": "componente identificado ou null",
  "assignee": "nome do responsável mencionado explicitamente ou null se não mencionado",
  "requestedBy": "quem solicitou, se diferente do assignee, ou null",
  "dueDate": "data extraída ou descrição textual (ex: 'fim do mês corrente') ou null",
  "region": "região ou localização mencionada, se relevante, ou null",
  "reason": "motivação ou contexto de negócio explicitado na mensagem, ou null",
  "description": "descrição expandida para o campo de descrição do card - inclua contexto e pontos de investigação prováveis",
  "actionRequired": "mensagem de alerta se houver informação crítica ausente (ex: assignee não definido, prazo ambíguo), ou null",
  "confidence": "high | medium | low - seu grau de confiança na extração"
}

## RESTRIÇÕES DE COMPORTAMENTO

- Nunca invente assignee - se não foi explicitamente mencionado, retorne null e adicione uma mensagem em actionRequired indicando que o responsável precisa ser definido
- Se a mensagem menciona múltiplas pessoas, identifique quem faz o quê - não atribua a quem estava falando, mas a quem se comprometeu
- Datas implícitas ("urgente", "antes da próxima reunião", "esta semana") devem ser descritas em palavras, não convertidas para datas fixas - você não sabe qual é a data atual
- Para mensagens com solicitação de voluntário ("alguém pode pegar isso?"), sinalize em actionRequired que o assignee precisa ser confirmado antes de mover o card para In Progress
- Se a mensagem não é acionável (ex: "precisamos pensar sobre isso"), retorne type: "spike" e adicione em actionRequired: "Mensagem é uma intenção, não uma ação - refine antes de criar o card"
- O campo confidence deve refletir sua certeza real - se a mensagem é ambígua, declare low
`
}

func (current *bot) parseNaturalLanguage(ctx context.Context, message string) (parsedCard, error) {
	prompt := strings.Replace(nlParserPrompt(), "[COLE A MENSAGEM AQUI]", message, 1)
	response, err := current.anthropic.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model("claude-sonnet-4-6"),
		MaxTokens: 1024,
		Messages:  []anthropic.MessageParam{anthropic.NewUserMessage(anthropic.NewTextBlock(prompt))},
	})
	if err != nil {
		return parsedCard{}, err
	}

	match := jsonObject.FindString(response.Content[0].Text)
	if match == "" {
		return parsedCard{}, errors.New("Parser não retornou JSON válido")
	}

	var parsed parsedCard
	if err := json.Unmarshal([]byte(match), &parsed); err != nil {
		return parsedCard{}, err
	}
	return parsed, nil
}

func mapPriorityToJira(priority string) string {
	return orDefault(jiraPriorities[priority], "Medium")
}

func resolveAssigneeID(name string) string {
	if name == "" {
		return ""
	}
	return settings.teamMembers[strings.ToLower(strings.TrimSpace(name))]
}

func issueType(cardType string) string {
	switch cardType {
	case "bug":
		return "Bug"
	case "spike":
		return "Task"
	default:
		return "Story"
	}
}

func cardDescription(parsed parsedCard, originalMessage string, slackUser string, assigneeID string) string {
	description := parsed.Description

	if parsed.Reason != "" {
		description += "\n\n**Motivação:** " + parsed.Reason
	}
	if parsed.ActionRequired != "" {
		description += "\n\n⚠️ **Ação necessária:** " + parsed.ActionRequired
	}
	if parsed.Assignee != "" && assigneeID == "" {
		description += fmt.Sprintf("\n\n⚠️ **Assignee não resolvido:** \"%s\" mencionado na mensagem mas não encontrado no mapeamento do time. Defina manualmente.", parsed.Assignee)
	}

	return description + fmt.Sprintf("\n\n---\n_Card criado automaticamente via NL to Workflow a partir de mensagem de %s._\n_Mensagem original: \"%s\"_", slackUser, originalMessage)
}

func encodeJSON(value any) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	err := encoder.Encode(value)
	return buffer.Bytes(), err
}

func createJiraCard(ctx context.Context, parsed parsedCard, originalMessage string, slackUser string) (jiraCard, error) {
	assigneeID := resolveAssigneeID(parsed.Assignee)
	fields := map[string]any{
		"project": map[string]any{"key": projectKey()},
		"summary": parsed.Title,
		"description": map[string]any{
			"type":    "doc",
			"version": 1,
			"content": []any{map[string]any{
				"type":    "paragraph",
				"content": []any{map[string]any{"type": "text", "text": cardDescription(parsed, originalMessage, slackUser, assigneeID)}},
			}},
		},
		"issuetype": map[string]any{"name": issueType(parsed.Type)},
		"priority":  map[string]any{"name": mapPriorityToJira(parsed.Priority)},
	}
	if assigneeID != "" {
		fields["assignee"] = map[string]any{"accountId": assigneeID}
	}

	payload, err := encodeJSON(map[string]any{"fields": fields})
	if err != nil {
		return jiraCard{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, os.Getenv("JIRA_BASE_URL")+"/rest/api/3/issue", bytes.NewReader(payload))
	if err != nil {
		return jiraCard{}, err
	}
	request.SetBasicAuth(os.Getenv("JIRA_EMAIL"), os.Getenv("JIRA_API_TOKEN"))
	request.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return jiraCard{}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode > 299 {
		return jiraCard{}, fmt.Errorf("Request failed with status code %d", response.StatusCode)
	}

	var created struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		return jiraCard{}, err
	}

	return jiraCard{
		key:              created.Key,
		url:              os.Getenv("JIRA_BASE_URL") + "/browse/" + created.Key,
		assigneeResolved: assigneeID != "",
		actionRequired:   parsed.ActionRequired,
	}, nil
}

func buildConfirmationMessage(parsed parsedCard) string {
	attention := ""
	if parsed.ActionRequired != "" {
		attention = "\n⚠️ *Atenção:* " + parsed.ActionRequired + "\n"
	}

	return "📋 *Card identificado - confirme antes de criar:*\n\n" +
		"*Tipo:* " + parsed.Type + "\n" +
		"*Título:* " + parsed.Title + "\n" +
		"*Prioridade:* " + parsed.Priority + "\n" +
		"*Responsável:* " + orDefault(parsed.Assignee, "[A DEFINIR]") + "\n" +
		"*Prazo:* " + orDefault(parsed.DueDate, "[A DEFINIR]") + "\n" +
		"*Componente:* " + orDefault(parsed.Component, "não identificado") + "\n" +
		attention +
		"\n_Confiança do parser: " + parsed.Confidence + "_"
}

func (current *bot) say(ctx context.Context, channel string, text string) error {
	_, _, err := current.api.PostMessageContext(ctx, channel, slack.MsgOptionText(text, false))
	return err
}

func (current *bot) createCard(ctx context.Context, channel string, userMessage string, slackUser string) error {
	if err := current.say(ctx, channel, fmt.Sprintf("⏳ Processando: _\"%s\"_", userMessage)); err != nil {
		return err
	}

	parsed, err := current.parseNaturalLanguage(ctx, userMessage)
	if err != nil {
		return err
	}

	if err := current.say(ctx, channel, buildConfirmationMessage(parsed)); err != nil {
		return err
	}

	card, err := createJiraCard(ctx, parsed, userMessage, slackUser)
	if err != nil {
		return err
	}

	response := fmt.Sprintf("✅ Card criado: *<%s|%s>*\n*%s*\nPrioridade: %s | Tipo: %s", card.url, card.key, parsed.Title, parsed.Priority, parsed.Type)
	if !card.assigneeResolved {
		response += "\n\n⚠️ *Assignee não atribuído* - defina o responsável no Jira antes de mover para In Progress."
	}
	if card.actionRequired != "" {
		response += "\n\n💬 *Ação necessária:* " + card.actionRequired
	}

	return current.say(ctx, channel, response)
}

func (current *bot) isSelf(message *slackevents.MessageEvent) bool {
	return message.User == current.botUserID || (message.BotID != "" && message.BotID == current.botID)
}

func (current *bot) onMessage(ctx context.Context, message *slackevents.MessageEvent) {
	if current.isSelf(message) || !strings.Contains(message.Text, settings.triggerKeyword) {
		return
	}

	userMessage := strings.TrimSpace(strings.Replace(message.Text, settings.triggerKeyword, "", 1))
	err := current.createCard(ctx, message.Channel, userMessage, message.User)
	if err == nil {
		return
	}

	fmt.Fprintln(os.Stderr, "Erro no NL to Workflow:", err)
	current.say(ctx, message.Channel, fmt.Sprintf("❌ Não foi possível processar a mensagem. Erro: %s\nCrie o card manualmente ou tente reformular a mensagem.", err))
}

func handleJiraWebhook(ctx context.Context, api *slack.Client, event jiraWebhookEvent) error {
	if event.WebhookEvent != "jira:issue_updated" || event.Changelog == nil {
		return nil
	}

	for _, item := range event.Changelog.Items {
		if item.Field != "status" {
			continue
		}

		message := fmt.Sprintf("🔄 *%s* - %s\nStatus: *%s* → *%s*\n<%s/browse/%s|Abrir card>", event.Issue.Key, event.Issue.Fields.Summary, item.FromString, item.ToString, os.Getenv("JIRA_BASE_URL"), event.Issue.Key)
		_, _, err := api.PostMessageContext(ctx, settings.notificationChannel, slack.MsgOptionText(message, false))
		return err
	}

	return nil
}

func (current *bot) dispatch(ctx context.Context, client *socketmode.Client, event socketmode.Event, announce func()) {
	switch event.Type {
	case socketmode.EventTypeHello:
		announce()
	case socketmode.EventTypeEventsAPI:
		client.Ack(*event.Request)

		payload, ok := event.Data.(slackevents.EventsAPIEvent)
		if !ok {
			return
		}
		if message, ok := payload.InnerEvent.Data.(*slackevents.MessageEvent); ok {
			go current.onMessage(ctx, message)
		}
	}
}

func main() {
	_ = godotenv.Load()

	ctx := context.Background()
	api := slack.New(
		os.Getenv("SLACK_BOT_TOKEN"),
		slack.OptionAppLevelToken(os.Getenv("SLACK_APP_TOKEN")),
		slack.OptionAPIURL(slackAPIURL()),
	)
	current := &bot{api: api, anthropic: anthropic.NewClient()}

	if identity, err := api.AuthTestContext(ctx); err == nil {
		current.botUserID = identity.UserID
		current.botID = identity.BotID
	}

	client := socketmode.New(api)
	var once sync.Once
	announce := func() {
		once.Do(func() {
			fmt.Println("⚡ NL to Workflow bot ativo - aguardando mensagens com trigger:", settings.triggerKeyword)
			fmt.Println("Canal de notificações:", settings.notificationChannel)
			fmt.Println("Projeto Jira:", projectKey())
		})
	}

	go func() {
		for event := range client.Events {
			current.dispatch(ctx, client, event, announce)
		}
	}()

	if err := client.RunContext(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
