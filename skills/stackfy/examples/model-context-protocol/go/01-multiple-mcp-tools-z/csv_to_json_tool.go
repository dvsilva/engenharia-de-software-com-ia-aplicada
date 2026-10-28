package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
)

func jsonString(value string) string {
	var buffer bytes.Buffer

	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)

	return strings.TrimSuffix(buffer.String(), "\n")
}

func recordJSON(header, row []string) string {
	fields := make([]string, 0, len(header))

	for index, name := range header {
		if index >= len(row) {
			break
		}
		fields = append(fields, jsonString(name)+":"+jsonString(strings.TrimSpace(row[index])))
	}

	return "{" + strings.Join(fields, ",") + "}"
}

func csvToJSON(text string) (string, int, error) {
	reader := csv.NewReader(strings.NewReader(text))
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true

	rows, err := reader.ReadAll()
	if err != nil {
		return "", 0, err
	}
	if len(rows) == 0 {
		return "[]", 0, nil
	}

	header := make([]string, len(rows[0]))
	for index, name := range rows[0] {
		header[index] = strings.TrimSpace(name)
	}

	records := make([]string, 0, len(rows)-1)
	for _, row := range rows[1:] {
		records = append(records, recordJSON(header, row))
	}

	return "[" + strings.Join(records, ",") + "]", len(records), nil
}

func getCSVToJSONTool() AgentTool {
	return AgentTool{
		Name: "csv_to_json",
		Definition: openai.ChatCompletionFunctionTool(shared.FunctionDefinitionParam{
			Name:        "csv_to_json",
			Description: openai.String("Convert CSV to JSON formart"),
			Parameters: shared.FunctionParameters{
				"type": "object",
				"properties": map[string]any{
					"csvText": map[string]any{
						"type":        "string",
						"description": "CSV data to be converted to JSON formart",
					},
				},
				"required":             []string{"csvText"},
				"additionalProperties": false,
				"$schema":              "http://json-schema.org/draft-07/schema#",
			},
		}),
		Invoke: func(_ context.Context, arguments map[string]any) (string, error) {
			csvText, isText := arguments["csvText"].(string)
			if !isText {
				return "", errors.New("Received tool input did not match expected schema")
			}

			result, count, err := csvToJSON(csvText)
			if err != nil {
				return "", err
			}

			fmt.Println("[getCSVToJSONTool] conversion result finished", count, "records")

			return result, nil
		},
	}
}
