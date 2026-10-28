import json

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from services.serp_api_service import SerpApiService


class GoogleTrendsInput(BaseModel):
    keywords: list[str] = Field(
        description="Keywords extracted from the video title to analyze"
    )


def create_google_trends_tool(serp_api_service: SerpApiService) -> BaseTool:
    def google_trends(keywords: list[str]) -> str:
        data = serp_api_service.get_google_trends(keywords)
        return json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    return StructuredTool.from_function(
        func=google_trends,
        name="google_trends",
        description=(
            "Get Google Trends data for a list of keywords. Use this to analyze if a "
            "video title or topic is trending, rising, or declining in popularity. "
            "Always call this when the user shares a video title idea."
        ),
        args_schema=GoogleTrendsInput,
    )
