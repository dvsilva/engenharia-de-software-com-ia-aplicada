import os
import sys
from dataclasses import dataclass
from functools import cached_property

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import SecretStr, TypeAdapter, ValidationError

from config import ModelConfig, config

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


@dataclass(frozen=True)
class StructuredSchema[T]:
    adapter: TypeAdapter[T]

    def response_format(self) -> dict[str, object]:
        return {
            "type": "json_schema",
            "json_schema": {
                "name": "extract",
                "strict": True,
                "schema": self.adapter.json_schema(),
            },
        }

    def parse(self, text: str) -> T | None:
        try:
            return self.adapter.validate_json(text, strict=True)
        except ValidationError:
            return None


@dataclass(frozen=True)
class StructuredResult[T]:
    success: bool
    data: T | None = None
    error: str | None = None


class OpenRouterService:
    def __init__(self, model_config: ModelConfig = config) -> None:
        self._config = model_config

    @cached_property
    def _llm_client(self) -> ChatOpenAI:
        return ChatOpenAI(
            api_key=SecretStr(self._config.api_key),
            model=self._config.models[0],
            temperature=self._config.temperature,
            base_url=os.environ.get("OPENAI_BASE_URL", OPENROUTER_BASE_URL),
            default_headers={
                "HTTP-Referer": self._config.http_referer,
                "X-Title": self._config.x_title,
            },
            extra_body={
                "models": self._config.models,
                "provider": self._config.provider,
            },
        )

    def generate_structured[T](
        self, system_prompt: str, user_prompt: str, schema: StructuredSchema[T]
    ) -> StructuredResult[T]:
        try:
            answer = self._llm_client.invoke(
                [SystemMessage(system_prompt), HumanMessage(user_prompt)],
                response_format=schema.response_format(),
            )

            return StructuredResult(success=True, data=schema.parse(answer.text))
        except Exception as error:
            print("Error OpenRouterService", error, file=sys.stderr)

            return StructuredResult(success=True, error=str(error))
