package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/google/uuid"
	"google.golang.org/genai"
)

const model = "gemini-2.5-flash"

const promptHeader = `
Persona: Você deve atuar como um "Senior Career Consultant" focado em Planos de Desenvolvimento Individual (IDP) para Engenheiros de Software.
Objetivo: Transformar o rascunho informal do usuário em um "Brag Document" executivo.

Regra 1: Usar tom profissional, objetivo e focado em impacto, sem adjetivos emocionais.
Regra 2: Se não existirem métricas exatas, infira a natureza da métrica baseada na ação tomada de forma plausível (ex: "tempo de execução não especificado mas otimizado").
Regra 3: Siga ESTRITAMENTE o formato do schema JSON fornecido.
Regra 4: O output deve respeitar o idioma original do input.

Aqui está o rascunho informal do usuário:
`

const promptFooter = "\n    "

type field struct {
	name        string
	list        bool
	description string
}

var bragFields = []field{
	{"title", false, "Ação principal + Resultado de alto nível."},
	{"context", false, "Situação ou Problema original. O que estava quebrado, lento, o desafio, etc."},
	{"actionTaken", false, "Ação técnica ou estratégica passo a passo tomada para resolver o problema."},
	{"businessImpact", false, "Qual o impacto de negócio. Tempo ganho, redução de falhas, etc."},
	{"metrics", true, `Apenas dados estritamente quantificáveis. Ex: "50% reduction", "10ms latency".`},
	{"technologiesUsed", true, "Ferramentas, linguagens, bibliotecas e plataformas mencionadas ou inferidas."},
}

var errNoOutput = errors.New("Falha ao gerar o conteúdo: Nenhum output válido foi retornado pela IA.")

func bragSchema() map[string]any {
	properties := map[string]any{}
	required := []string{}

	for _, field := range bragFields {
		property := map[string]any{"type": "string", "description": field.description}
		if field.list {
			property = map[string]any{
				"type":        "array",
				"items":       map[string]any{"type": "string"},
				"description": field.description,
			}
		}
		properties[field.name] = property
		required = append(required, field.name)
	}

	return map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": true,
	}
}

func apiKey() string {
	for _, name := range []string{"GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY"} {
		if key := os.Getenv(name); key != "" {
			return key
		}
	}
	return ""
}

func isTextList(value any) bool {
	items, ok := value.([]any)
	if !ok {
		return false
	}
	for _, item := range items {
		if _, ok := item.(string); !ok {
			return false
		}
	}
	return true
}

func checkBrag(brag map[string]any) error {
	for _, field := range bragFields {
		value, present := brag[field.name]
		if !present {
			return fmt.Errorf("schema validation failed: %s is required", field.name)
		}
		if field.list && !isTextList(value) {
			return fmt.Errorf("schema validation failed: %s must be a list of strings", field.name)
		}
		if _, isText := value.(string); !field.list && !isText {
			return fmt.Errorf("schema validation failed: %s must be a string", field.name)
		}
	}
	return nil
}

func generateBrag(ctx context.Context, definition string) (map[string]any, error) {
	key := apiKey()
	if key == "" {
		return nil, errors.New("please set the GEMINI_API_KEY or GOOGLE_API_KEY environment variable")
	}

	client, err := genai.NewClient(ctx, &genai.ClientConfig{APIKey: key, Backend: genai.BackendGeminiAPI})
	if err != nil {
		return nil, err
	}

	result, err := client.Models.GenerateContent(
		ctx,
		model,
		genai.Text(promptHeader+definition+promptFooter),
		&genai.GenerateContentConfig{
			Temperature:        genai.Ptr[float32](0.8),
			ResponseMIMEType:   "application/json",
			ResponseJsonSchema: bragSchema(),
		},
	)
	if err != nil {
		return nil, err
	}

	text := result.Text()
	if text == "" {
		return nil, errNoOutput
	}

	var brag map[string]any
	if err := json.Unmarshal([]byte(text), &brag); err != nil {
		return nil, fmt.Errorf("the model did not answer JSON: %w", err)
	}
	if err := checkBrag(brag); err != nil {
		return nil, err
	}

	brag["id"] = uuid.NewString()
	return brag, nil
}
