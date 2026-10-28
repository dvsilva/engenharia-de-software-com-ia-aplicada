from collections.abc import Mapping

from domain.customer import Customer, CustomerMutation, CustomerQuery
from infrastructure.customer_http_client import CustomerHttpClient


def _matches(customer: Customer, query: CustomerQuery) -> bool:
    fields: Mapping[str, object] = customer
    return all(
        isinstance(field := fields.get(key), str) and value in field
        for key, value in query.items()
    )


class CustomerService:
    def __init__(self, base_url: str, service_token: str) -> None:
        self._client = CustomerHttpClient(base_url, service_token)

    async def list_customers(self) -> list[Customer]:
        return await self._client.list_customers()

    async def create_customer(self, customer: dict[str, str]) -> CustomerMutation:
        return await self._client.create_customer(customer)

    async def find_customer(self, query: CustomerQuery) -> Customer | None:
        customer_id = query.get("_id")
        if customer_id:
            return await self._client.get_customer_by_id(customer_id)

        customers = await self._client.list_customers()
        return next(
            (customer for customer in customers if _matches(customer, query)), None
        )

    async def update_customer(
        self, customer_id: str, data: dict[str, str]
    ) -> CustomerMutation:
        return await self._client.update_customer(customer_id, data)

    async def delete_customer(self, customer_id: str) -> CustomerMutation:
        return await self._client.delete_customer(customer_id)
