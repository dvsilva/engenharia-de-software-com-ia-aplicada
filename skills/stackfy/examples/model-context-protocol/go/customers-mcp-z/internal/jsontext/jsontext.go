package jsontext

import (
	"bytes"
	"encoding/json"
	"strings"
)

// Written as JavaScript's JSON.stringify writes it, without escaping <, >, and &.
func encode(value any, indent string) string {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)

	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", indent)
	if err := encoder.Encode(value); err != nil {
		return ""
	}

	return strings.TrimSuffix(buffer.String(), "\n")
}

func Compact(value any) string {
	return encode(value, "")
}

func Indented(value any) string {
	return encode(value, "  ")
}
