package provedores

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
)

const (
	nomeFerramenta      = "buscar_clausula_regulatoria"
	descricaoFerramenta = "Busca cláusulas regulatórias de estudos clínicos por tema e jurisdição. Use quando precisar de texto normativo (ANVISA ou FDA) para compor uma seção do documento."
	geminiPadrao        = "https://generativelanguage.googleapis.com"
	openAIPadrao        = "https://api.openai.com/v1"
)

var propriedades = map[string]any{
	"tema":       map[string]any{"type": "string"},
	"jurisdicao": map[string]any{"type": "string", "enum": []string{"ANVISA", "FDA"}},
}

var obrigatorios = []string{"tema", "jurisdicao"}

var parametros = map[string]any{
	"type":       "object",
	"properties": propriedades,
	"required":   obrigatorios,
}

type Mensagem struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Resultado struct {
	Tipo  string          `json:"tipo"`
	Nome  string          `json:"nome,omitempty"`
	Args  json.RawMessage `json:"args,omitempty"`
	Texto *string         `json:"texto,omitempty"`
}

func chamadaFerramenta(nome string, argumentos json.RawMessage) Resultado {
	return Resultado{Tipo: "chamada_ferramenta", Nome: nome, Args: argumentos}
}

func respostaFinal(texto string) Resultado {
	return Resultado{Tipo: "resposta_final", Texto: &texto}
}

var ferramentaClaude = anthropic.ToolParam{
	Name:        nomeFerramenta,
	Description: anthropic.String(descricaoFerramenta),
	InputSchema: anthropic.ToolInputSchemaParam{Properties: propriedades, Required: obrigatorios},
}

func ChamarClaude(ctx context.Context, historico []Mensagem) (Resultado, error) {
	claude := anthropic.NewClient()
	mensagens := make([]anthropic.MessageParam, 0, len(historico))
	for _, mensagem := range historico {
		bloco := anthropic.NewTextBlock(mensagem.Content)
		if mensagem.Role == "assistant" {
			mensagens = append(mensagens, anthropic.NewAssistantMessage(bloco))
			continue
		}
		mensagens = append(mensagens, anthropic.NewUserMessage(bloco))
	}

	resposta, err := claude.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model("claude-sonnet-5"),
		MaxTokens: 1024,
		Tools:     []anthropic.ToolUnionParam{{OfTool: &ferramentaClaude}},
		Messages:  mensagens,
	})
	if err != nil {
		return Resultado{}, err
	}

	for _, bloco := range resposta.Content {
		if bloco.Type == "tool_use" {
			return chamadaFerramenta(bloco.Name, bloco.Input), nil
		}
	}
	if len(resposta.Content) == 0 {
		return Resultado{}, fmt.Errorf("resposta do Claude sem conteúdo")
	}

	return respostaFinal(resposta.Content[0].Text), nil
}

var ferramentaGemini = map[string]any{
	"type":        "function",
	"name":        nomeFerramenta,
	"description": descricaoFerramenta,
	"parameters":  parametros,
}

type passoInteracao struct {
	Type      string          `json:"type"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
	Content   []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
}

func ChamarGemini(ctx context.Context, protocolo string) (Resultado, error) {
	var interacao struct {
		Steps []passoInteracao `json:"steps"`
	}
	cabecalhos := map[string]string{"x-goog-api-key": os.Getenv("GEMINI_API_KEY")}
	corpo := map[string]any{
		"model": "gemini-3.5-flash",
		"input": protocolo,
		"tools": []any{ferramentaGemini},
	}
	if err := postar(ctx, enderecoBase("GOOGLE_GEMINI_BASE_URL", geminiPadrao)+"/v1beta/interactions", cabecalhos, corpo, &interacao); err != nil {
		return Resultado{}, err
	}

	for _, passo := range interacao.Steps {
		if passo.Type == "function_call" {
			return chamadaFerramenta(passo.Name, passo.Arguments), nil
		}
	}

	return respostaFinal(textoDeSaida(interacao.Steps)), nil
}

func textoDeSaida(passos []passoInteracao) string {
	var partes []string
	coletando := false

	for indice := len(passos) - 1; indice >= 0; indice-- {
		passo := passos[indice]
		if passo.Type == "user_input" {
			break
		}
		if passo.Type == "thought" {
			continue
		}
		if passo.Type != "model_output" {
			if coletando {
				break
			}
			continue
		}
		for conteudo := len(passo.Content) - 1; conteudo >= 0; conteudo-- {
			if passo.Content[conteudo].Type != "text" {
				if coletando {
					return juntarInvertido(partes)
				}
				continue
			}
			coletando = true
			partes = append(partes, passo.Content[conteudo].Text)
		}
	}

	return juntarInvertido(partes)
}

func juntarInvertido(partes []string) string {
	var texto strings.Builder
	for indice := len(partes) - 1; indice >= 0; indice-- {
		texto.WriteString(partes[indice])
	}

	return texto.String()
}

var ferramentaGPT = map[string]any{
	"type": "function",
	"function": map[string]any{
		"name":        nomeFerramenta,
		"description": descricaoFerramenta,
		"parameters":  parametros,
	},
}

func ChamarGPT(ctx context.Context, historico []Mensagem) (Resultado, error) {
	var resposta struct {
		Choices []struct {
			Message struct {
				Content   *string `json:"content"`
				ToolCalls []struct {
					Function struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}
	cabecalhos := map[string]string{"Authorization": "Bearer " + os.Getenv("OPENAI_API_KEY")}
	corpo := map[string]any{
		"model":    "gpt-5.6",
		"messages": historico,
		"tools":    []any{ferramentaGPT},
	}
	if err := postar(ctx, enderecoBase("OPENAI_BASE_URL", openAIPadrao)+"/chat/completions", cabecalhos, corpo, &resposta); err != nil {
		return Resultado{}, err
	}
	if len(resposta.Choices) == 0 {
		return Resultado{}, fmt.Errorf("resposta do GPT sem choices")
	}

	mensagem := resposta.Choices[0].Message
	if len(mensagem.ToolCalls) > 0 {
		chamada := mensagem.ToolCalls[0].Function
		if !json.Valid([]byte(chamada.Arguments)) {
			return Resultado{}, fmt.Errorf("argumentos inválidos do GPT: %s", chamada.Arguments)
		}
		return chamadaFerramenta(chamada.Name, json.RawMessage(chamada.Arguments)), nil
	}
	if mensagem.Content == nil {
		return respostaFinal(""), nil
	}

	return respostaFinal(*mensagem.Content), nil
}

func enderecoBase(variavel, padrao string) string {
	endereco := strings.TrimSpace(os.Getenv(variavel))
	if endereco == "" {
		endereco = padrao
	}

	return strings.TrimSuffix(endereco, "/")
}

func postar(ctx context.Context, endereco string, cabecalhos map[string]string, corpo, destino any) error {
	conteudo, err := json.Marshal(corpo)
	if err != nil {
		return err
	}

	requisicao, err := http.NewRequestWithContext(ctx, http.MethodPost, endereco, bytes.NewReader(conteudo))
	if err != nil {
		return err
	}
	requisicao.Header.Set("Content-Type", "application/json")
	for nome, valor := range cabecalhos {
		requisicao.Header.Set(nome, valor)
	}

	resposta, err := http.DefaultClient.Do(requisicao)
	if err != nil {
		return err
	}
	defer resposta.Body.Close()

	carga, err := io.ReadAll(resposta.Body)
	if err != nil {
		return err
	}
	if resposta.StatusCode >= http.StatusBadRequest {
		return fmt.Errorf("%d %s", resposta.StatusCode, strings.TrimSpace(string(carga)))
	}

	return json.Unmarshal(carga, destino)
}
