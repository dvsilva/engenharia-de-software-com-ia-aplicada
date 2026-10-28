import json
import math
import os
import re
import sys
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen

from config import SerpApiConfig
from data.trending_data import rising_trend_fixture
from services.trends import (
    KeywordTrend,
    RelatedQuery,
    RisingTopic,
    Trend,
    TrendingData,
)

SERPAPI_BASE_URL = "https://serpapi.com"

MISSING_KEY = "api_key is required, get it from: https://serpapi.com/manage-api-key"

REQUEST_TIMEOUT = 60

RISING = 1.2

DECLINING = 0.8

Response = dict[str, Any]


def average(values: list[float]) -> float:
    return sum(values) / len(values)


def round_half_up(value: float) -> int:
    return math.floor(value + 0.5)


def as_number(value: float | str) -> float:
    try:
        return float(value)
    except ValueError:
        return math.nan


def trend_of(values: list[float]) -> Trend:
    recent_average = average(values[-3:])
    early_average = average(values[:3])

    if recent_average > early_average * RISING:
        return "rising"
    if recent_average < early_average * DECLINING:
        return "declining"
    return "stable"


def growth_of(value: float | str) -> float | str:
    if isinstance(value, str) and "+" in value:
        return int(re.sub(r"\D", "", value))
    return value


def title_of(topic: str | dict[str, Any]) -> str:
    if isinstance(topic, dict):
        return str(topic.get("title") or topic)
    return topic


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class SerpApiService:
    def __init__(self, config: SerpApiConfig) -> None:
        self._config = config

    def get_google_trends(self, keywords: list[str]) -> TrendingData:
        print("🔍 Fetching Google Trends data for keywords:", keywords)
        if self._config.disabled:
            print(
                "⚠️  SerpAPIService is disabled. Returning fixture data.",
                file=sys.stderr,
            )
            return rising_trend_fixture

        keyword_trends: list[KeywordTrend] = []
        related_queries: list[RelatedQuery] = []
        rising_topics: list[RisingTopic] = []

        for keyword in keywords:
            try:
                print(f'🔍 Fetching data for "{keyword}"...')
                trends_data = self._fetch_trends_data(keyword)
                print(
                    f'🔍 Fetched trends for "{keyword}":',
                    json.dumps(trends_data, indent=2, ensure_ascii=False),
                )

                keyword_trend = self._parse_keyword_trend(keyword, trends_data)
                if keyword_trend:
                    keyword_trends.append(keyword_trend)

                related_queries.extend(self._parse_related_queries(trends_data))
                rising_topics.extend(self._parse_rising_topics(trends_data))
            except Exception as error:
                print(
                    f'⚠️  Failed to fetch trends for "{keyword}":',
                    error,
                    file=sys.stderr,
                )

        return {
            "keywords": sorted(
                keyword_trends,
                key=lambda trend: trend["interestOverTime"],
                reverse=True,
            ),
            "relatedQueries": sorted(
                related_queries,
                key=lambda query: as_number(query["value"]),
                reverse=True,
            )[:10],
            "risingTopics": sorted(
                rising_topics,
                key=lambda topic: as_number(topic["growth"]),
                reverse=True,
            )[:5],
            "timestamp": now_iso(),
        }

    def _fetch_trends_data(self, keyword: str) -> Response:
        if not self._config.api_key:
            raise ValueError(MISSING_KEY)

        query = urlencode(
            {
                "engine": "google_trends",
                "q": keyword,
                "api_key": self._config.api_key,
                "date": "now 7-d",
                "data_type": "TIMESERIES",
                "output": "json",
            }
        )
        base_url = os.environ.get("SERPAPI_BASE_URL", SERPAPI_BASE_URL)

        with urlopen(f"{base_url}/search?{query}", timeout=REQUEST_TIMEOUT) as response:
            data: Response = json.loads(response.read())
            return data

    def _parse_keyword_trend(self, keyword: str, data: Response) -> KeywordTrend | None:
        timeline = (data.get("interest_over_time") or {}).get("timeline_data")
        if not timeline:
            return None

        values: list[float] = [
            ((item.get("values") or [{}])[0].get("extracted_value") or 0)
            for item in timeline
        ]

        return {
            "keyword": keyword,
            "searchVolume": max(values),
            "interestOverTime": round_half_up(average(values)),
            "trend": trend_of(values),
        }

    def _parse_related_queries(self, data: Response) -> list[RelatedQuery]:
        related = data.get("related_queries") or {}

        return [
            {"query": item["query"], "value": item["value"]}
            for group in ("top", "rising")
            for item in related.get(group) or []
            if item.get("query") and item.get("value")
        ]

    def _parse_rising_topics(self, data: Response) -> list[RisingTopic]:
        topics = (data.get("related_topics") or {}).get("rising") or []

        return [
            {"topic": title_of(item["topic"]), "growth": growth_of(item["value"])}
            for item in topics
            if item.get("topic") and item.get("value")
        ]
