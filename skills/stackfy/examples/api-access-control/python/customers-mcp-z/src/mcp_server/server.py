from typing import Any

from jsonschema import Draft7Validator
from mcp import types
from mcp.server import Server, ServerRequestContext

from application.customer_service import CustomerService
from mcp_server.prompts.find_customer import (
    FIND_CUSTOMER_PROMPT,
    render_find_customer_prompt,
)
from mcp_server.registered_tool import RegisteredTool
from mcp_server.resources.api_info import create_api_info_resource
from mcp_server.tools.create_customer import create_create_customer_tool
from mcp_server.tools.delete_customer import create_delete_customer_tool
from mcp_server.tools.get_customer import create_get_customer_tool
from mcp_server.tools.list_customers import create_list_customers_tool
from mcp_server.tools.update_customer import create_update_customer_tool

BASE_URL = "http://localhost:9999/v1"


def _rejected(text: str) -> types.CallToolResult:
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=text)], is_error=True
    )


def _first_error(schema: dict[str, Any], value: Any) -> str | None:
    error = next(iter(Draft7Validator(schema).iter_errors(value)), None)
    return None if error is None else error.message


def create_server(service_token: str) -> Server[Any]:
    service = CustomerService(BASE_URL, service_token)
    registered: list[RegisteredTool] = [
        create_list_customers_tool(service),
        create_get_customer_tool(service),
        create_create_customer_tool(service),
        create_update_customer_tool(service),
        create_delete_customer_tool(service),
    ]
    tools = {tool.definition.name: tool for tool in registered}
    api_info = create_api_info_resource(BASE_URL)

    async def list_tools(
        context: ServerRequestContext[Any], params: types.PaginatedRequestParams | None
    ) -> types.ListToolsResult:
        return types.ListToolsResult(tools=[tool.definition for tool in registered])

    async def call_tool(
        context: ServerRequestContext[Any], params: types.CallToolRequestParams
    ) -> types.CallToolResult:
        tool = tools.get(params.name)
        if tool is None:
            return _rejected(f"Tool {params.name} not found")

        arguments = params.arguments or {}
        invalid_input = _first_error(tool.definition.input_schema, arguments)
        if invalid_input:
            return _rejected(
                f"Input validation error: Invalid arguments for tool {params.name}: {invalid_input}"
            )

        result = await tool.handle(arguments)
        output_schema = tool.definition.output_schema or {}
        invalid_output = _first_error(output_schema, result.structured_content)
        if invalid_output:
            return _rejected(
                f"Output validation error: Invalid structured content for tool {params.name}: {invalid_output}"
            )

        return result

    async def list_resources(
        context: ServerRequestContext[Any], params: types.PaginatedRequestParams | None
    ) -> types.ListResourcesResult:
        return types.ListResourcesResult(resources=[api_info.definition])

    async def read_resource(
        context: ServerRequestContext[Any], params: types.ReadResourceRequestParams
    ) -> types.ReadResourceResult:
        if str(params.uri) != api_info.definition.uri:
            raise ValueError(f"Resource {params.uri} not found")

        return api_info.contents

    async def list_prompts(
        context: ServerRequestContext[Any], params: types.PaginatedRequestParams | None
    ) -> types.ListPromptsResult:
        return types.ListPromptsResult(prompts=[FIND_CUSTOMER_PROMPT])

    async def get_prompt(
        context: ServerRequestContext[Any], params: types.GetPromptRequestParams
    ) -> types.GetPromptResult:
        if params.name != FIND_CUSTOMER_PROMPT.name:
            raise ValueError(f"Prompt {params.name} not found")

        return render_find_customer_prompt(params.arguments or {})

    return Server(
        "@erickwendel/ew-customers-mcp",
        version="0.0.1",
        on_list_tools=list_tools,
        on_call_tool=call_tool,
        on_list_resources=list_resources,
        on_read_resource=read_resource,
        on_list_prompts=list_prompts,
        on_get_prompt=get_prompt,
    )
