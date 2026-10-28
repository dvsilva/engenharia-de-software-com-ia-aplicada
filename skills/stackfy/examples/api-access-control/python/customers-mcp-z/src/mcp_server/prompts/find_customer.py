import json

from mcp import types

QUERY_FIELDS = (
    ("_id", "MongoDB ObjectId of the customer"),
    ("name", "Full name of the customer"),
    ("phone", "phone number of the customer"),
)

FIND_CUSTOMER_PROMPT = types.Prompt(
    name="find_customer_prompt",
    description="Prompt to search a customer using any combination of _id, name or phone",
    arguments=[
        types.PromptArgument(name=name, description=description, required=False)
        for name, description in QUERY_FIELDS
    ],
)


def render_find_customer_prompt(arguments: dict[str, str]) -> types.GetPromptResult:
    query = {name: arguments[name] for name, _ in QUERY_FIELDS if name in arguments}
    compact = json.dumps(query, separators=(",", ":"), ensure_ascii=False)
    text = (
        "Please find the customer matching the following query using the "
        f"get_customer or list_customers tool.\nQuery: {compact}"
    )

    return types.GetPromptResult(
        messages=[
            types.PromptMessage(
                role="user", content=types.TextContent(type="text", text=text)
            )
        ]
    )
