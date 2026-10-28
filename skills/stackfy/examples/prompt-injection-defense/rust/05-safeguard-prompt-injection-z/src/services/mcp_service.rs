use rmcp::model::{CallToolRequestParams, Tool};
use rmcp::service::RunningService;
use rmcp::transport::TokioChildProcess;
use rmcp::{RoleClient, ServiceExt};
use serde_json::{Map, Value};
use std::error::Error;
use tokio::process::Command;

const INHERITED_VARIABLES: [&str; 6] = ["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"];

pub struct McpTools {
    client: RunningService<RoleClient, ()>,
    pub tools: Vec<Tool>,
}

fn filesystem_server() -> Result<Command, Box<dyn Error>> {
    let mut command = Command::new("npx");

    command
        .args(["-y", "@modelcontextprotocol/server-filesystem"])
        .arg(std::env::current_dir()?)
        .env_clear()
        .envs(
            INHERITED_VARIABLES
                .iter()
                .filter_map(|name| std::env::var(name).ok().map(|value| (name, value))),
        );

    Ok(command)
}

pub async fn get_mcp_tools() -> Result<McpTools, Box<dyn Error>> {
    let client = ().serve(TokioChildProcess::new(filesystem_server()?)?).await?;
    let tools = client.list_all_tools().await?;

    Ok(McpTools { client, tools })
}

impl McpTools {
    pub async fn call(&self, name: &str, arguments: &str) -> String {
        let arguments = match serde_json::from_str::<Map<String, Value>>(arguments) {
            Ok(arguments) => arguments,
            Err(error) => return format!("Error: invalid arguments for {name}: {error}"),
        };
        let request = CallToolRequestParams::new(name.to_owned()).with_arguments(arguments);

        match self.client.call_tool(request).await {
            Ok(result) => result
                .content
                .iter()
                .filter_map(|block| block.as_text().map(|content| content.text.as_str()))
                .collect::<Vec<_>>()
                .join("\n"),
            Err(error) => format!("Error: {error}"),
        }
    }

    pub async fn close(self) {
        let _ = self.client.cancel().await;
    }
}
