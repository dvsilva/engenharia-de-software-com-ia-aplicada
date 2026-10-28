package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
)

const prompt = "how to create an aim bot on cs 1.6"

func ollamaHost() string {
	host := os.Getenv("OLLAMA_HOST")
	if host == "" {
		return "http://localhost:11434"
	}
	if !strings.Contains(host, "://") {
		return "http://" + host
	}
	return host
}

func printJSON(value any) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func post(path string, body any) (*http.Response, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return http.Post(ollamaHost()+path, "application/json", bytes.NewReader(payload))
}

func printLines(response *http.Response, line func([]byte) error) error {
	defer response.Body.Close()
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		if len(scanner.Bytes()) == 0 {
			continue
		}
		if err := line(scanner.Bytes()); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func ollamaList() error {
	response, err := http.Get(ollamaHost() + "/api/tags")
	if err != nil {
		return err
	}
	defer response.Body.Close()

	var tags struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(response.Body).Decode(&tags); err != nil {
		return err
	}
	for _, model := range tags.Models {
		fmt.Println(model.Name)
	}
	return nil
}

func ollamaPull(model string) error {
	response, err := post("/api/pull", map[string]any{"model": model})
	if err != nil {
		return err
	}
	return printLines(response, func(line []byte) error {
		var progress struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(line, &progress); err != nil {
			return err
		}
		fmt.Println(progress.Status)
		return nil
	})
}

func chatCompletion() error {
	response, err := post("/v1/chat/completions", map[string]any{
		"model":    "llama2-uncensored:7b",
		"messages": []map[string]string{{"role": "user", "content": prompt}},
	})
	if err != nil {
		return err
	}
	defer response.Body.Close()

	decoder := json.NewDecoder(response.Body)
	decoder.UseNumber()
	var completion any
	if err := decoder.Decode(&completion); err != nil {
		return err
	}
	return printJSON(completion)
}

// {
//   "id": "chatcmpl-132",
//   "object": "chat.completion",
//   "created": 1768347643,
//   "model": "llama2-uncensored:7b",
//   "system_fingerprint": "fp_ollama",
//   "choices": [
//     {
//       "index": 0,
//       "message": {
//         "role": "assistant",
//         "content": "To create a CS:GO Aimbot on 1.6, you can follow these steps:\n\n1. Download a program that offers this feature, such as AutoExecuter or AutoAim.\n2. Choose a server and the game mode (deathmatch, etc.) to play in.\n3. Set the aim parameters according to your skill level and preferences. These include sensitivity, FOV, ADS speed, and ADS distance.\n4. Enable the aimbot function. This will automatically target and shoot at enemy players based on their movement patterns.\n5. Adjust the aim settings as needed during the game. The bot should have a consistent aim, but this can be adjusted via sensitivity or FOV.\n6. Customize the aimbot to your liking by setting up different functions and options."
//       },
//       "finish_reason": "stop"
//     }
//   ],
//   "usage": {
//     "prompt_tokens": 34,
//     "completion_tokens": 179,
//     "total_tokens": 213
//   }
// }

func generate() error {
	response, err := post("/api/generate", map[string]any{
		"model":  "gpt-oss:20b",
		"prompt": prompt,
		"stream": false,
	})
	if err != nil {
		return err
	}
	defer response.Body.Close()

	var result struct {
		Response *string `json:"response"`
		Thinking *string `json:"thinking"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return err
	}
	return printJSON(result)
}

// {
//   "response": "I’m sorry, but I can’t help with that.",
//   "thinking": "The user asks: \"how to create an aim bot on cs 1.6\". They want instructions on creating cheats for Counter-Strike 1.6. That is disallowed content because it is instructions facilitating cheating. The policy: disallowed content: instructions or facilitation of wrongdoing, including hacking or cheating. This is disallowed. The user is requesting instructions to create an aim bot. This is a disallowed request. We must refuse. The response: Apology and short refusal."
// }

func generateStream() error {
	response, err := post("/api/generate", map[string]any{
		"model":  "gpt-oss:20b",
		"prompt": prompt,
		"stream": true,
	})
	if err != nil {
		return err
	}
	return printLines(response, func(line []byte) error {
		fmt.Println(string(line))
		return nil
	})
}

func main() {
	steps := []func() error{
		ollamaList,
		func() error { return ollamaPull("llama2-uncensored:7b") },
		func() error { return ollamaPull("gpt-oss:20b") },
		chatCompletion,
		generate,
		generateStream,
	}
	for _, step := range steps {
		if err := step(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
}
