package prompts

import "encoding/json"

type QueryAnalysisData struct {
	Complexity            string   `json:"complexity"`
	RequiresDecomposition bool     `json:"requiresDecomposition"`
	SubQuestions          []string `json:"subQuestions"`
	Reasoning             string   `json:"reasoning"`
}

var QueryAnalysisSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "complexity": { "type": "string", "enum": ["simple", "complex"], "description": "Whether the query is simple or complex" },
    "requiresDecomposition": { "type": "boolean", "description": "Whether the query needs to be broken down into sub-queries" },
    "subQuestions": { "type": "array", "items": { "type": "string" }, "description": "Sub-questions if decomposition is required (empty array if simple)" },
    "reasoning": { "type": "string", "description": "Brief explanation of the analysis" }
  },
  "required": ["complexity", "requiresDecomposition", "subQuestions", "reasoning"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}`)

type analysisExample struct {
	Question              string   `json:"question"`
	Complexity            string   `json:"complexity"`
	RequiresDecomposition bool     `json:"requiresDecomposition"`
	SubQuestions          []string `json:"subQuestions"`
	Reasoning             string   `json:"reasoning"`
}

func QueryAnalyzerSystemPrompt() string {
	return compact(struct {
		Role     string            `json:"role"`
		Rules    []string          `json:"rules"`
		Examples []analysisExample `json:"examples"`
	}{
		Role: "Query Complexity Analyzer - Determine if questions need multi-step decomposition",
		Rules: []string{
			"Generate sub-questions in the SAME language as the input question (ignore data language)",
			"Simple: Single entity, direct retrieval, no group comparisons",
			"Complex: Comparing groups, multiple dependent calculations, relationship analysis",
			"Decompose into max 3 sub-questions, each independently answerable, logically ordered",
		},
		Examples: []analysisExample{
			{Question: "List all available courses", Complexity: "simple", RequiresDecomposition: false, SubQuestions: []string{}, Reasoning: "Direct retrieval, no comparisons"},
			{Question: "Compare revenue between high vs low completion courses", Complexity: "complex", RequiresDecomposition: true, SubQuestions: []string{"Average completion per course?", "Revenue for courses >70% completion?", "Revenue for courses <70% completion?"}, Reasoning: "Multiple aggregations + group comparison"},
		},
	})
}

func QueryAnalyzerUserPrompt(question string) string {
	return question
}
