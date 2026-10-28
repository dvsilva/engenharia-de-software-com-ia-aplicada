import json
from typing import Any

from mcp import types

from application.customer_service import CustomerService
from domain.customer import CUSTOMER_MUTATION_SCHEMA
from mcp_server.registered_tool import RegisteredTool, answered, failed


def create_list_customers_tool(service: CustomerService) -> RegisteredTool:
    async def handle(arguments: dict[str, Any]) -> types.CallToolResult:
        try:
            customers = await service.list_customers()
        except Exception as error:
            return failed("list customers", error)

        text = json.dumps(customers, indent=2, ensure_ascii=False)
        return answered(text, {"customers": customers})

    definition = types.Tool(
        name="list_customers",
        description="List all customers",
        input_schema={"type": "object", "properties": {}},
        output_schema=CUSTOMER_MUTATION_SCHEMA,
    )
    return RegisteredTool(definition, handle)
