import unittest

from domain.errors import IncidentNotFoundError
from store.in_memory_store import InMemoryStore
from store.seed import seed_store


def seeded_store() -> InMemoryStore:
    store = InMemoryStore()
    seed_store(store)

    return store


class InMemoryStoreTest(unittest.TestCase):
    def test_get_alerts_returns_all_six_seeded_alerts(self) -> None:
        self.assertEqual(len(seeded_store().get_alerts()), 6)

    def test_get_alerts_firing_returns_exactly_three(self) -> None:
        self.assertEqual(len(seeded_store().get_alerts("firing")), 3)

    def test_get_alerts_resolved_returns_exactly_three(self) -> None:
        self.assertEqual(len(seeded_store().get_alerts("resolved")), 3)

    def test_create_incident_generates_unique_ids(self) -> None:
        store = seeded_store()

        first = store.create_incident("High error rate", "payment-api", "critical")
        second = store.create_incident("Another issue", "auth-service", "high")

        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(first["status"], "open")
        self.assertEqual(second["status"], "open")

    def test_resolve_incident_transitions_status_to_resolved(self) -> None:
        store = seeded_store()

        created = store.create_incident("Need mitigation", "order-service", "critical")
        resolved = store.resolve_incident(created["id"])

        self.assertEqual(resolved["status"], "resolved")
        self.assertIsInstance(resolved["resolved_at"], int)

    def test_resolve_incident_raises_incident_not_found_for_unknown_id(self) -> None:
        with self.assertRaises(IncidentNotFoundError):
            seeded_store().resolve_incident("inc-unknown")
