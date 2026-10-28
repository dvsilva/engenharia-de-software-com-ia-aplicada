from typing import Any, NotRequired, TypedDict

JsonSchema = dict[str, Any]


class Customer(TypedDict):
    _id: NotRequired[str]
    name: str
    phone: str


CustomerQuery = dict[str, str]

CustomerMutation = dict[str, Any]


def _described(kind: str, description: str) -> JsonSchema:
    return {"type": kind, "description": description}


CUSTOMER_ID = _described("string", "MongoDB ObjectId of the customer")

CUSTOMER_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "_id": CUSTOMER_ID,
        "name": {"type": "string"},
        "phone": {"type": "string"},
    },
    "required": ["name", "phone"],
}

CUSTOMER_QUERY_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "_id": CUSTOMER_ID,
        "name": _described("string", "Full name of the customer"),
        "phone": _described("string", "phone number of the customer"),
    },
}

CUSTOMER_UPDATE_SCHEMA: JsonSchema = {
    **CUSTOMER_QUERY_SCHEMA,
    "required": ["_id"],
}

CUSTOMER_MUTATION_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "id": _described("string", "MongoDB ObjectId of the deleted customer"),
        "message": _described("string", "Confirmation message"),
        "isError": _described("boolean", "Indicates if an error occurred"),
        "customer": {**CUSTOMER_SCHEMA, "description": "The found customer"},
        "customers": {
            "type": "array",
            "items": CUSTOMER_SCHEMA,
            "description": "List of customers",
        },
    },
}
