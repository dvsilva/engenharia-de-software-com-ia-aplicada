import os

from langchain_openai import ChatOpenAI
from pydantic import SecretStr

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def create_model() -> ChatOpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY")

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY environment variable is required")

    return ChatOpenAI(
        api_key=SecretStr(api_key),
        model=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
        temperature=0,
        base_url=os.environ.get("OPENAI_BASE_URL", OPENROUTER_BASE_URL),
    )
