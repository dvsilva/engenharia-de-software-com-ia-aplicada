import json
from dataclasses import dataclass
from typing import Any, cast
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from anyio import to_thread

from domain.customer import Customer, CustomerMutation
from domain.errors import ForbiddenError, RateLimitError, UnauthorizedError

STATUS_ERRORS: dict[int, type[Exception]] = {
    401: UnauthorizedError,
    403: ForbiddenError,
    429: RateLimitError,
}


@dataclass(frozen=True)
class Answer:
    status: int
    reason: str
    text: str

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    def json(self) -> Any:
        return json.loads(self.text)


def _send(request: Request) -> Answer:
    try:
        with urlopen(request) as response:
            return Answer(response.status, response.reason, response.read().decode())
    except HTTPError as error:
        return Answer(error.code, error.reason, error.read().decode())


def _assert_ok(answer: Answer) -> None:
    known = STATUS_ERRORS.get(answer.status)
    if known:
        raise known()
    if not answer.ok:
        raise Exception(f"HTTP {answer.status} - {answer.reason} - {answer.text}")


class CustomerHttpClient:
    def __init__(self, base_url: str, service_token: str) -> None:
        self._base_url = base_url
        self._auth_headers = {"Authorization": f"Bearer {service_token}"}

    async def _request(
        self, method: str, path: str, body: dict[str, str] | None = None
    ) -> Answer:
        headers = dict(self._auth_headers)
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False).encode()

        request = Request(
            f"{self._base_url}{path}", data=data, headers=headers, method=method
        )
        return await to_thread.run_sync(_send, request)

    async def list_customers(self) -> list[Customer]:
        answer = await self._request("GET", "/customers")
        _assert_ok(answer)
        return cast(list[Customer], answer.json())

    async def get_customer_by_id(self, customer_id: str) -> Customer | None:
        answer = await self._request("GET", f"/customers/{customer_id}")
        if answer.status in (404, 400):
            return None
        _assert_ok(answer)
        return cast(Customer, answer.json())

    async def create_customer(self, data: dict[str, str]) -> CustomerMutation:
        answer = await self._request("POST", "/customers", data)
        _assert_ok(answer)
        return cast(CustomerMutation, answer.json())

    async def update_customer(
        self, customer_id: str, data: dict[str, str]
    ) -> CustomerMutation:
        answer = await self._request("PUT", f"/customers/{customer_id}", data)
        _assert_ok(answer)
        return cast(CustomerMutation, answer.json())

    async def delete_customer(self, customer_id: str) -> CustomerMutation:
        answer = await self._request("DELETE", f"/customers/{customer_id}")
        _assert_ok(answer)
        return cast(CustomerMutation, answer.json())
