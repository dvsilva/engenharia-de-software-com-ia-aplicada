package prompts

import (
	"bytes"
	"encoding/json"
	"strings"
)

func compact(value any) string {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)

	return strings.TrimSuffix(buffer.String(), "\n")
}
