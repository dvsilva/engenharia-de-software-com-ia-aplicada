from typing import Literal, TypedDict

Trend = Literal["rising", "stable", "declining"]


class KeywordTrend(TypedDict):
    keyword: str
    searchVolume: float
    interestOverTime: int
    trend: Trend


class RelatedQuery(TypedDict):
    query: str
    value: float | str


class RisingTopic(TypedDict):
    topic: str
    growth: float | str


class TrendingData(TypedDict):
    keywords: list[KeywordTrend]
    relatedQueries: list[RelatedQuery]
    risingTopics: list[RisingTopic]
    timestamp: str
