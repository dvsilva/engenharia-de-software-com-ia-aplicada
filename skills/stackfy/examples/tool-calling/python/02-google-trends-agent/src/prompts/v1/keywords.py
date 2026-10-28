from pydantic import BaseModel, Field


class KeywordsSchema(BaseModel):
    keywords: list[str] = Field(
        description=(
            "The 2 most relevant search keywords extracted from the user question "
            "to query Google Trends."
        )
    )


def get_keywords_system_prompt() -> str:
    return """You are a research assistant for video content creators.
Given a user question about video topics, extract exactly 2 keywords and call google_trends ONCE with both keywords in a single array. Do not call the tool more than once.
Do not answer without calling the tool first."""
