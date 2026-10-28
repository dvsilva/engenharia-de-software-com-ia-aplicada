package prompts

import "encoding/json"

type CypherCorrectionData struct {
	CorrectedQuery string `json:"correctedQuery"`
	Explanation    string `json:"explanation"`
}

var CypherCorrectionSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "correctedQuery": { "type": "string", "description": "The corrected Neo4j Cypher query" },
    "explanation": { "type": "string", "description": "Brief explanation of what was fixed" }
  },
  "required": ["correctedQuery", "explanation"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}`)

type correctionExample struct {
	Failed    string `json:"failed"`
	Error     string `json:"error"`
	Corrected string `json:"corrected"`
	Fix       string `json:"fix"`
}

func CypherCorrectionSystemPrompt(schema string) string {
	return compact(struct {
		Role    string            `json:"role"`
		Schema  string            `json:"schema"`
		Rules   []string          `json:"rules"`
		Example correctionExample `json:"example"`
	}{
		Role:   "Neo4j Cypher Query Debugger - Fix invalid queries based on error messages",
		Schema: schema,
		Rules: []string{
			"Read error carefully, preserve original intent, return valid executable query",
			"Aggregation errors: Use WITH to separate grouping from aggregation",
			"Variable scope errors: Pass variables through WITH or redefine them",
			"NULL errors: Add NULLS LAST/FIRST to ORDER BY",
			"Property errors: Check schema, use correct aliases (n.name AS name)",
		},
		Example: correctionExample{
			Failed:    "WITH SUM(p.amount) AS total ... RETURN c.name, revenue, round(revenue / total, 2)",
			Error:     "Implicit grouping expressions: totalRevenue",
			Corrected: "WITH SUM(p.amount) AS total ... WITH total, c.name AS name, SUM(p2.amount) AS rev RETURN name, rev, round(rev / total, 2)",
			Fix:       "Moved grouping into WITH before RETURN",
		},
	})
}

func CypherCorrectionUserPrompt(failedQuery, errorMessage, originalQuestion string) string {
	return compact(struct {
		FailedQuery      string `json:"failed_query,omitempty"`
		ErrorMessage     string `json:"error_message,omitempty"`
		OriginalQuestion string `json:"original_question,omitempty"`
	}{failedQuery, errorMessage, originalQuestion})
}
