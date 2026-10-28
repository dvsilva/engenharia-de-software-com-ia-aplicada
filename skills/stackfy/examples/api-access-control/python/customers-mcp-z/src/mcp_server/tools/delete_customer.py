from typing import Any

from mcp import types

from application.customer_service import CustomerService
from domain.customer import CUSTOMER_MUTATION_SCHEMA
from mcp_server.registered_tool import RegisteredTool, answered, failed, message_of


def create_delete_customer_tool(service: CustomerService) -> RegisteredTool:
    async def handle(arguments: dict[str, Any]) -> types.CallToolResult:
        try:
            result = await service.delete_customer(arguments["_id"])
        except Exception as error:
            return failed("delete customer", error)

        return answered(message_of(result), result)

    definition = types.Tool(
        name="delete_customer",
        description="Delete a customer by their _id",
        input_schema={
            "type": "object",
            "properties": {
                "_id": {
                    "type": "string",
                    "description": "MongoDB ObjectId of the customer to delete",
                }
            },
            "required": ["_id"],
        },
        output_schema=CUSTOMER_MUTATION_SCHEMA,
    )
    return RegisteredTool(definition, handle)
