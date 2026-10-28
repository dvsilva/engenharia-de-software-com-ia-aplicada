package main

import "encoding/json"

type IntentData struct {
	Intent      string  `json:"intent"`
	FileContent *string `json:"fileContent"`
	FileName    *string `json:"fileName"`
	FileType    string  `json:"fileType"`
}

var intentSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "intent": {
      "type": "string",
      "description": "A clean, concise natural-language description of what the user wants to accomplish. Do NOT include any CSV or JSON data in this field."
    },
    "fileContent": {
      "type": ["string", "null"],
      "description": "The raw CSV or JSON block embedded in the message, exactly as provided. If there is no file content, set this to null."
    },
    "fileName": {
      "type": ["string", "null"],
      "description": "An inferred filename or type for the data (e.g. \"sales\", \"report\"). Derive it from the question."
    },
    "fileType": {
      "type": "string",
      "enum": ["csv", "json", "unknown"],
      "description": "The inferred file type based on the content or filename. If it looks like CSV, set to \"csv\". If it looks like JSON, set to \"json\". Otherwise, set to \"unknown\"."
    }
  },
  "required": ["intent", "fileContent", "fileName", "fileType"],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}`)

const identifyIntentSystemPrompt = `You are an intent extraction assistant.
Analyze the user message and extract the requested fields as structured output.
The user message may contain a natural-language instruction mixed with raw file content (CSV or JSON).
Separate them cleanly: the intent is the goal, fileContent is the raw data block, fileName is the inferred file name.
If no file data is present, set fileContent and fileName to null.`
