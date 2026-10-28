import os
import sys

import anyio
from mcp.server.stdio import stdio_server

from mcp_server.server import create_server


async def serve(service_token: str) -> None:
    server = create_server(service_token)

    async with stdio_server() as (read_stream, write_stream):
        print("Customers MCP Server running on stdio", file=sys.stderr)
        await server.run(
            read_stream, write_stream, server.create_initialization_options()
        )


service_token = os.environ.get("SERVICE_TOKEN", "")

if not service_token:
    print("[error]: SERVICE_TOKEN env var is required", file=sys.stderr)
    sys.exit(1)

anyio.run(serve, service_token)
