import os
import sys
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ModelConfig:
    api_key: str
    http_referer: str
    x_title: str
    provider: dict[str, dict[str, str]]
    models: list[str] = field(default_factory=list)
    temperature: float = 0.7


if not os.environ.get("OPENROUTER_API_KEY"):
    print(
        "Assertion failed: OPENROUTER_API_KEY is not set in environment variables",
        file=sys.stderr,
    )

config = ModelConfig(
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    http_referer="",
    x_title="IA Devs - Prompt Chaining Article Generator",
    models=["arcee-ai/trinity-large-preview:free"],
    provider={"sort": {"by": "throughput", "partition": "none"}},
    temperature=0.7,
)
