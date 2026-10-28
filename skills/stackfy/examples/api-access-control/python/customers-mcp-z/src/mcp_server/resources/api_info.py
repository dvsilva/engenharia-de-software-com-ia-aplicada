from dataclasses import dataclass

from mcp import types

API_INFO_URI = "customers://api-info"


@dataclass(frozen=True)
class RegisteredResource:
    definition: types.Resource
    contents: types.ReadResourceResult


def create_api_info_resource(base_url: str) -> RegisteredResource:
    text = f"""
Customers API
  Base URL : {base_url}
  Endpoints:
    GET    /customers          — list all customers
    GET    /customers/:id      — get customer by id
    POST   /customers          — create customer  {{ name, phone }}
    PUT    /customers/:id      — update customer  {{ name, phone }}
    DELETE /customers/:id      — delete customer

  Customer shape: {{ _id: string, name: string, phone: string }}
""".strip()

    definition = types.Resource(
        uri=API_INFO_URI,
        name=API_INFO_URI,
        description="Describes the Customers REST API that this MCP server wraps.",
    )
    contents = types.ReadResourceResult(
        contents=[
            types.TextResourceContents(
                uri=API_INFO_URI, mime_type="text/plain", text=text
            )
        ]
    )
    return RegisteredResource(definition, contents)
