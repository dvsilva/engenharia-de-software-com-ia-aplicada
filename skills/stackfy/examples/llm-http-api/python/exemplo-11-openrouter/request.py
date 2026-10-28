import json
import os

import requests
from dotenv import load_dotenv

load_dotenv(".env", override=True)

API_URL = f"{os.environ.get('OPENAI_BASE_URL') or 'https://openrouter.ai/api/v1'}/chat/completions"
OPENROUTER_SITE_URL = "http://localhost:3000"
OPENROUTER_SITE_NAME = "My Example"

NLP_MODEL = "google/gemma-3-27b-it:free"

response = requests.post(
    API_URL,
    headers={
        "Authorization": f"Bearer {os.environ.get('OPENROUTER_API_KEY', '')}",
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_SITE_NAME,
    },
    json={
        "model": NLP_MODEL,
        "messages": [
            {
                "role": "user",
                "content": "Me conte uma curiosidade sobre LLMs",
            }
        ],
        "temperature": 0.3,
        "max_tokens": 1000,
    },
)

print(json.dumps(response.json(), indent=2, ensure_ascii=False))
