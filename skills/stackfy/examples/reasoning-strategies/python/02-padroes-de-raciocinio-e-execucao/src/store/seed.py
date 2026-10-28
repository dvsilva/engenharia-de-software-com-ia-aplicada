from pathlib import Path
from typing import Annotated, TypedDict

from pydantic import Field, TypeAdapter

from domain.types import Alert, AlertStatus, Service, Severity, Store
from store.in_memory_store import InMemoryStore

NonEmptyText = Annotated[str, Field(min_length=1)]


class ServiceSeed(TypedDict):
    name: NonEmptyText


class AlertSeed(TypedDict):
    id: NonEmptyText
    service: NonEmptyText
    description: NonEmptyText
    severity: Severity
    status: AlertStatus


class SeedFile(TypedDict):
    services: Annotated[list[ServiceSeed], Field(min_length=1)]
    alerts: Annotated[list[AlertSeed], Field(min_length=1)]


parsed_seed = TypeAdapter(SeedFile).validate_json(
    Path(__file__).with_name("seed-data.json").read_bytes()
)
services: list[Service] = list(parsed_seed["services"])
alerts: list[Alert] = list(parsed_seed["alerts"])


def seed_store(store: Store) -> None:
    if not isinstance(store, InMemoryStore):
        raise TypeError("seedStore requires InMemoryStore in this feature scope.")

    store.seed(services, alerts)


if __name__ == "__main__":
    seeded = InMemoryStore()
    seed_store(seeded)
    print(f"Seeded {len(seeded.get_alerts())} alerts.")
