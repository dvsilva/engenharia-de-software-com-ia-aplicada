from datetime import UTC, datetime


def to_iso_string(instant: datetime) -> str:
    utc = instant.astimezone(UTC)

    return f"{utc:%Y-%m-%dT%H:%M:%S}.{utc.microsecond // 1000:03d}Z"


def parse_date(text: str) -> datetime:
    parsed = datetime.fromisoformat(text)

    return parsed if parsed.tzinfo else parsed.astimezone()
