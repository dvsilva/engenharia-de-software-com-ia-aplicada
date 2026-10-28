package prompts

import "encoding/json"

type AnalyticalResponseData struct {
	Answer            string   `json:"answer"`
	FollowUpQuestions []string `json:"followUpQuestions"`
}

var AnalyticalResponseSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "answer": { "type": "string", "description": "Complete analytical response in prose format" },
    "followUpQuestions": { "type": "array", "items": { "type": "string" }, "description": "2-3 suggested follow-up questions" }
  },
  "required": ["answer", "followUpQuestions"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}`)

type revenueRow struct {
	CourseName   string `json:"courseName"`
	TotalRevenue int    `json:"totalRevenue"`
}

type analyticalExample struct {
	Question          string       `json:"question"`
	DBResults         []revenueRow `json:"dbResults"`
	Answer            string       `json:"answer"`
	FollowUpQuestions []string     `json:"followUpQuestions"`
}

type Step struct {
	StepNumber int    `json:"stepNumber"`
	Question   string `json:"question"`
	Query      string `json:"query"`
	Results    string `json:"results"`
}

func AnalyticalSystemPrompt() string {
	return compact(struct {
		Role    string            `json:"role"`
		Rules   []string          `json:"rules"`
		Example analyticalExample `json:"example"`
	}{
		Role: "Sales Analytics Reporter - Generate data-driven insights in prose",
		Rules: []string{
			"CRITICAL: Match the QUESTION language, NOT data language. English question = English answer, Portuguese question = Portuguese answer",
			"Write complete analytical responses using actual data (no placeholders)",
			"Include calculations: percentages, distributions, averages, comparisons",
			"Start with key finding, use bullets for lists, highlight patterns",
			"Provide 2-3 specific follow-up questions in the same language as the original question",
			"Do NOT include queries or apologize for errors",
		},
		Example: analyticalExample{
			Question:          "What is the revenue distribution across courses?",
			DBResults:         []revenueRow{{CourseName: "JS Expert", TotalRevenue: 25000}, {CourseName: "Node Streams", TotalRevenue: 15000}},
			Answer:            "Strong revenue concentration: **JS Expert** leads with $25,000 (62.5%), **Node Streams** $15,000 (37.5%). Top course generates 67% more than second place, indicating strong market demand.",
			FollowUpQuestions: []string{"Which course has highest completion rate?", "How many students purchased JS Expert?", "What payment methods are most popular?"},
		},
	})
}

func AnalyticalUserPrompt(question, query, dbResults string) string {
	return compact(struct {
		Question  string `json:"question"`
		Query     string `json:"query"`
		DBResults string `json:"dbResults"`
	}{question, query, dbResults})
}

func ErrorResponsePrompt(errorMessage, question string) string {
	return compact(struct {
		Error    string `json:"error"`
		Question string `json:"question,omitempty"`
		Task     string `json:"task"`
	}{errorMessage, question, "Explain error in user-friendly terms, suggest alternatives, provide 2-3 better questions"})
}

func NoResultsPrompt(question, query string) string {
	return compact(struct {
		Question string `json:"question"`
		Query    string `json:"query"`
		Task     string `json:"task"`
	}{question, query, "No data found. Suggest reasons and 2-3 alternative questions"})
}

func MultiStepSynthesisPrompt(originalQuestion string, steps []Step) string {
	return compact(struct {
		OriginalQuestion string `json:"original_question"`
		Steps            []Step `json:"steps"`
		Task             string `json:"task"`
	}{originalQuestion, steps, "Synthesize all steps into coherent narrative, highlight comparisons and patterns"})
}
