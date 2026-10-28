class IncidentNotFoundError(Exception):
    def __init__(self, id: str) -> None:
        super().__init__(f"Incident not found: {id}")
