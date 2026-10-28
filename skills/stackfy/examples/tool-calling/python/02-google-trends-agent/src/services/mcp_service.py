import os

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

from config import config
from services.serp_api_service import SerpApiService
from tools.google_trends_tool import create_google_trends_tool


async def get_mcp_tools() -> list[BaseTool]:
    mcp_client = MultiServerMCPClient(
        {
            "filesystem": {
                "transport": "stdio",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", os.getcwd()],
            },
        }
    )

    mcp_tools = await mcp_client.get_tools()

    serp_api_service = SerpApiService(config.serp_api_config)
    google_trends_tool = create_google_trends_tool(serp_api_service)

    return [*mcp_tools, google_trends_tool]
