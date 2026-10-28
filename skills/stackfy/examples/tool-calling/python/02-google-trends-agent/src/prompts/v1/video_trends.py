from pydantic import BaseModel, Field


class VideoTrendsSchema(BaseModel):
    answer: str = Field(
        description=(
            "A clear and concise analysis of the video title idea based on Google "
            "Trends data, including whether it is trending, stable, or declining, "
            "along with actionable recommendations."
        )
    )


def get_responder_system_prompt() -> str:
    return """You are a helpful content strategy assistant for video creators.
You will receive a user question and real Google Trends data.
Use the data to give a concrete, data-driven recommendation: confirm the title, suggest improvements, or propose rising alternatives.
Be specific and encouraging. Always respond in the same language the user wrote in, preferably in Brazilian Portuguese."""


def get_responder_user_prompt(question: str, trends_data: str) -> str:
    return f"User question: {question}\n\nGoogle Trends data:\n{trends_data}"
