from typing import Any

from mcp import types

from application.customer_service import CustomerService
from domain.customer import CUSTOMER_MUTATION_SCHEMA, CUSTOMER_UPDATE_SCHEMA
from mcp_server.registered_tool import RegisteredTool, answered, failed, message_of


def create_update_customer_tool(service: CustomerService) -> RegisteredTool:
    async def handle(arguments: dict[str, Any]) -> types.CallToolResult:
        changes: dict[str, str] = {
            field: arguments[field] for field in ("name", "phone") if field in arguments
        }

        try:
            result = await service.update_customer(arguments["_id"], changes)
        except Exception as error:
            return failed("update customer", error)

        return answered(message_of(result), result)

    definition = types.Tool(
        name="update_customer",
        description="Update an existing customer's name and/or phone number by their _id",
        input_schema=CUSTOMER_UPDATE_SCHEMA,
        output_schema=CUSTOMER_MUTATION_SCHEMA,
    )
    return RegisteredTool(definition, handle)
