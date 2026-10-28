import json
import os

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from config import ModelConfig, config
from services.mcp_service import get_mcp_tools

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def empty_key_authorization(api_key: str) -> dict[str, str]:
    return {} if api_key else {"Authorization": "Bearer"}


def to_json(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump()
    return str(value)


class OpenRouterService:
    def __init__(self, model_config: ModelConfig = config) -> None:
        self._config = model_config
        self._llm_client = self._create_chat_model(model_config.models[0])
        self._tools: list[BaseTool] = []

    def _create_chat_model(self, model_name: str) -> ChatOpenAI:
        api_key = self._config.api_key

        return ChatOpenAI(
            api_key=lambda: api_key,
            model=model_name,
            temperature=self._config.temperature,
            max_tokens=self._config.max_tokens,
            base_url=os.environ.get("OPENAI_BASE_URL", OPENROUTER_BASE_URL),
            default_headers={
                "HTTP-Referer": self._config.http_referer,
                "X-Title": self._config.x_title,
                **empty_key_authorization(api_key),
            },
            extra_body={
                "models": self._config.models,
                "provider": self._config.provider,
            },
        )

    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: type[BaseModel] | None = None,
    ) -> object:
        if not self._tools:
            self._tools = await get_mcp_tools()

        agent = create_agent(
            model=self._llm_client,
            tools=[] if schema else self._tools,
            response_format=ProviderStrategy(schema) if schema else None,
        )

        data = await agent.ainvoke(
            {"messages": [SystemMessage(system_prompt), HumanMessage(user_prompt)]}
        )
        print(
            "✅ LLM Response:",
            json.dumps(data, default=to_json, indent=2, ensure_ascii=False),
        )

        if schema:
            return data.get("structured_response")
        return data["messages"][-1].text
