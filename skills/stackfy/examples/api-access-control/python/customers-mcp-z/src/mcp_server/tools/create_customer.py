from typing import Any

from mcp import types

from application.customer_service import CustomerService
from domain.customer import CUSTOMER_MUTATION_SCHEMA
from mcp_server.registered_tool import RegisteredTool, answered, failed, message_of


def create_create_customer_tool(service: CustomerService) -> RegisteredTool:
    async def handle(arguments: dict[str, Any]) -> types.CallToolResult:
        customer = {"name": arguments["name"], "phone": arguments["phone"]}

        try:
            result = await service.create_customer(customer)
        except Exception as error:
            return failed("create customer", error)

        return answered(message_of(result), result)

    definition = types.Tool(
        name="create_customer",
        description="Create a new customer",
        input_schema={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Full name of the customer"},
                "phone": {
                    "type": "string",
                    "description": "Phone number of the customer",
                },
            },
            "required": ["name", "phone"],
        },
        output_schema=CUSTOMER_MUTATION_SCHEMA,
    )
    return RegisteredTool(definition, handle)
