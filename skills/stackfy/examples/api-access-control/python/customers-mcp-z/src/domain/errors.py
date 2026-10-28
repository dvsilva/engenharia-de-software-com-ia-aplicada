class UnauthorizedError(Exception):
    def __init__(
        self, message: str = "Unauthorized: service token is missing or invalid"
    ) -> None:
        super().__init__(message)


class ForbiddenError(Exception):
    def __init__(
        self, message: str = "Forbidden: token does not have sufficient permissions"
    ) -> None:
        super().__init__(message)


class RateLimitError(Exception):
    def __init__(
        self, message: str = "Rate limit exceeded. Please try again later."
    ) -> None:
        super().__init__(message)
