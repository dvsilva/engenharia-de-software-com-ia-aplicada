using System.Net.Http.Json;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

const string Prompt = "how to create an aim bot on cs 1.6";

var ollamaHost = OllamaHost();
var printOptions = new JsonSerializerOptions
{
    WriteIndented = true,
    Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
};
using var http = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };

Console.OutputEncoding = Encoding.UTF8;

await OllamaList();
await OllamaPull("llama2-uncensored:7b");
await OllamaPull("gpt-oss:20b");
await ChatCompletion();
await Generate();
await GenerateStream();

string OllamaHost()
{
    var host = Environment.GetEnvironmentVariable("OLLAMA_HOST");
    if (string.IsNullOrEmpty(host)) return "http://localhost:11434";

    return host.Contains("://") ? host : $"http://{host}";
}

void PrintJson(JsonNode? value) =>
    Console.WriteLine(value?.ToJsonString(printOptions) ?? "null");

async Task<HttpResponseMessage> Post(string path, object body)
{
    var request = new HttpRequestMessage(HttpMethod.Post, ollamaHost + path)
    {
        Content = JsonContent.Create(body),
    };
    var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

    return response.EnsureSuccessStatusCode();
}

async Task<JsonNode?> ReadJson(HttpResponseMessage response) =>
    JsonNode.Parse(await response.Content.ReadAsStreamAsync());

async Task PrintLines(HttpResponseMessage response, Func<string, string> format)
{
    using var reader = new StreamReader(await response.Content.ReadAsStreamAsync());

    while (await reader.ReadLineAsync() is { } line)
    {
        if (line.Length == 0) continue;

        Console.WriteLine(format(line));
    }
}

async Task OllamaList()
{
    var tags = JsonNode.Parse(await http.GetStringAsync($"{ollamaHost}/api/tags"));

    foreach (var model in tags?["models"]?.AsArray() ?? [])
        Console.WriteLine(model?["name"]?.GetValue<string>());
}

async Task OllamaPull(string model)
{
    using var response = await Post("/api/pull", new { model });

    await PrintLines(response, line => JsonNode.Parse(line)?["status"]?.GetValue<string>() ?? "");
}

async Task ChatCompletion()
{
    using var response = await Post("/v1/chat/completions", new
    {
        model = "llama2-uncensored:7b",
        messages = new[] { new { role = "user", content = Prompt } },
    });

    PrintJson(await ReadJson(response));
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

async Task Generate()
{
    using var response = await Post("/api/generate", new { model = "gpt-oss:20b", prompt = Prompt, stream = false });
    var result = await ReadJson(response);

    PrintJson(new JsonObject
    {
        ["response"] = result?["response"]?.DeepClone(),
        ["thinking"] = result?["thinking"]?.DeepClone(),
    });
}

// {
//   "response": "I’m sorry, but I can’t help with that.",
//   "thinking": "The user asks: \"how to create an aim bot on cs 1.6\". They want instructions on creating cheats for Counter-Strike 1.6. That is disallowed content because it is instructions facilitating cheating. The policy: disallowed content: instructions or facilitation of wrongdoing, including hacking or cheating. This is disallowed. The user is requesting instructions to create an aim bot. This is a disallowed request. We must refuse. The response: Apology and short refusal."
// }

async Task GenerateStream()
{
    using var response = await Post("/api/generate", new { model = "gpt-oss:20b", prompt = Prompt, stream = true });

    await PrintLines(response, line => line);
}
