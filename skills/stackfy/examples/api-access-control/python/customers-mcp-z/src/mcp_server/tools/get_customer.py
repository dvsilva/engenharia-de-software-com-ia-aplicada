import json
from typing import Any

from mcp import types

from application.customer_service import CustomerService
from domain.customer import (
    CUSTOMER_MUTATION_SCHEMA,
    CUSTOMER_QUERY_SCHEMA,
    CustomerQuery,
)
from mcp_server.registered_tool import RegisteredTool, answered, failed


def _query_of(arguments: dict[str, Any]) -> CustomerQuery:
    return {
        field: arguments[field]
        for field in ("_id", "name", "phone")
        if field in arguments
    }


def create_get_customer_tool(service: CustomerService) -> RegisteredTool:
    async def handle(arguments: dict[str, Any]) -> types.CallToolResult:
        try:
            customer = await service.find_customer(_query_of(arguments))
        except Exception as error:
            return failed("find customer", error)

        text = json.dumps(customer, indent=2, ensure_ascii=False)
        return answered(text, {"customer": customer})

    definition = types.Tool(
        name="get_customer",
        description="Find a customer by _id, name, or phone number",
        input_schema=CUSTOMER_QUERY_SCHEMA,
        output_schema=CUSTOMER_MUTATION_SCHEMA,
    )
    return RegisteredTool(definition, handle)
