package jsontext

import (
	"bytes"
	"encoding/json"
)

func Compact(value any) string {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return "null"
	}

	return string(bytes.TrimRight(buffer.Bytes(), "\n"))
}

func CompactRaw(raw json.RawMessage) string {
	var buffer bytes.Buffer
	if err := json.Compact(&buffer, raw); err != nil {
		return string(raw)
	}

	return buffer.String()
}
