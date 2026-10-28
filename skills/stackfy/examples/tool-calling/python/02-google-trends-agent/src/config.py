import os
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class SerpApiConfig:
    api_key: str
    cache_ttl: int | None = None
    disabled: bool = False


@dataclass(frozen=True)
class ModelConfig:
    api_key: str
    http_referer: str
    x_title: str
    provider: dict[str, dict[str, str]]
    models: list[str]
    temperature: float
    max_tokens: int
    serp_api_config: SerpApiConfig


def assert_variable(name: str) -> None:
    if not os.environ.get(name):
        print(
            f"Assertion failed: {name} is not set in environment variables",
            file=sys.stderr,
        )


assert_variable("OPENROUTER_API_KEY")
assert_variable("SERPAPI_API_KEY")

config = ModelConfig(
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    http_referer="",
    x_title="IA Devs - Transforming Services into Tools",
    models=["arcee-ai/trinity-large-preview:free"],
    provider={"sort": {"by": "throughput", "partition": "none"}},
    temperature=0.7,
    max_tokens=2048,
    serp_api_config=SerpApiConfig(
        api_key=os.environ.get("SERPAPI_API_KEY", ""),
        cache_ttl=3600000,
        disabled=False,
    ),
)
