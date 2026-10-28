use safeguard_prompt_injection::config::{get_user, users};
use safeguard_prompt_injection::graph::factory::build_graph;
use safeguard_prompt_injection::graph::{Input, Message};
use std::error::Error;
use std::fs;
use std::process::exit;

const AVAILABLE_USERS: &str = "Available users: erickwendel (admin), ananeri (member)";

struct Arguments {
    username: Option<String>,
    unsafe_mode: bool,
    message: Option<String>,
    prompt_path: Option<String>,
}

fn value_after(args: &[String], flag: &str) -> Option<String> {
    let index = args.iter().position(|arg| arg == flag)?;

    args.get(index + 1)
        .filter(|value| !value.is_empty())
        .cloned()
}

fn parse_args() -> Arguments {
    let args: Vec<String> = std::env::args().skip(1).collect();

    Arguments {
        username: value_after(&args, "--user"),
        unsafe_mode: args.iter().any(|arg| arg == "--unsafe"),
        message: value_after(&args, "--message"),
        prompt_path: value_after(&args, "--prompt-path"),
    }
}

fn display_banner(username: &str, role: &str, guardrails_enabled: bool) {
    let guardrails = if guardrails_enabled {
        "✅ ENABLED (Safe)"
    } else {
        "❌ DISABLED (Unsafe - Vulnerable!)"
    };

    println!("{}", "═".repeat(70));
    println!("  🔒 Guardrails & Prompt Injection Demo");
    println!("{}", "═".repeat(70));
    println!();
    println!("👤 User: {username} ({role})");
    println!("🛡️  Guardrails: {guardrails}");
    println!();
    println!("{}", "─".repeat(70));
    println!();
}

fn read_prompt(path: &str) -> Result<String, Box<dyn Error>> {
    fs::read_to_string(path).map_err(|error| format!("{error}, open '{path}'").into())
}

fn prompt_of(
    message: Option<String>,
    prompt_path: Option<String>,
) -> Option<Result<String, Box<dyn Error>>> {
    message
        .map(Ok)
        .or_else(|| prompt_path.map(|path| read_prompt(&path)))
}

async fn run() -> Result<(), Box<dyn Error>> {
    let users = users()?;
    let Arguments {
        username,
        unsafe_mode,
        message,
        prompt_path,
    } = parse_args();

    let (Some(username), Some(prompt)) = (username, prompt_of(message, prompt_path)) else {
        eprintln!("❌ Error: --user and (--message or --prompt-path) flags are required");
        eprintln!(
            "Usage: target/release/index --user <username> --message \"your message\" [--unsafe]"
        );
        eprintln!("{AVAILABLE_USERS}");
        exit(1);
    };
    let prompt = prompt?;
    let Some(user) = get_user(&users, &username) else {
        eprintln!("❌ Error: User \"{username}\" not found");
        eprintln!("{AVAILABLE_USERS}");
        exit(1);
    };

    let guardrails_enabled = !unsafe_mode;

    let mut graph = build_graph()?;
    display_banner(&user.display_name, &user.role, guardrails_enabled);
    let permissions = if user.permissions.is_empty() {
        "None".into()
    } else {
        user.permissions.join(", ")
    };
    println!("📋 Your permissions: {permissions}");
    println!();
    println!("You: {prompt}");
    println!();

    let result = graph
        .invoke(Input {
            user,
            guardrails_enabled,
            messages: vec![Message::Human(prompt)],
        })
        .await;

    println!("🤖 Assistant: {}", result.last_text());
    println!();
    graph.close().await;

    Ok(())
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("Fatal error: {error}");
        exit(1);
    }
}
