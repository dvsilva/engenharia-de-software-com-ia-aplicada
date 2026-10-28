mod mcp;
mod service;

use std::{error::Error, process::exit};

use rmcp::{ServiceExt, transport::stdio};

use crate::mcp::CipherSuite;

async fn run() -> Result<(), Box<dyn Error>> {
    let server = CipherSuite::new().serve(stdio()).await?;

    eprintln!("Encrypt MCP Server running on stdio");
    server.waiting().await?;

    Ok(())
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("Fatal error in main(): {error}");
        exit(1);
    }
}
