use song_highlights::graph::factory::{DEFAULT_DB_PATH, build_graph};
use song_highlights::graph::{Input, Message, RunConfig};
use std::error::Error;
use std::io::{self, BufRead, Write};
use std::time::{SystemTime, UNIX_EPOCH};

fn parse_args() -> Option<String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let user_index = args.iter().position(|arg| arg == "--user")?;

    args.get(user_index + 1)
        .filter(|user| !user.is_empty())
        .cloned()
}

fn now_in_milliseconds() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default()
}

fn read_line(prompt: &str) -> io::Result<Option<String>> {
    print!("{prompt}");
    io::stdout().flush()?;

    let mut line = String::new();
    if io::stdin().lock().read_line(&mut line)? == 0 {
        return Ok(None);
    }

    Ok(Some(line.trim_end_matches(['\n', '\r']).into()))
}

fn run() -> Result<(), Box<dyn Error>> {
    println!("{}", "═".repeat(60));
    println!("  🎵 Recomendador de Músicas com Memória (LangGraph)");
    println!("{}", "═".repeat(60));
    println!("\nDigite suas mensagens abaixo. Digite \"exit\" para sair.\n");

    let (mut graph, preferences_service) = build_graph(DEFAULT_DB_PATH)?;

    let actual_user_id = parse_args().unwrap_or_else(|| "anonymous".into());
    let thread_id = format!("{actual_user_id}-{}", now_in_milliseconds());

    println!("👤 Usuário: {actual_user_id}");
    println!("💬 Thread da Conversa: {thread_id}\n");

    let config = RunConfig {
        thread_id,
        user_id: actual_user_id.clone(),
    };
    let user_context = preferences_service.get_basic_info(&actual_user_id)?;
    if let Some(context) = &user_context {
        println!("📚 Informações do usuário carregadas:\n{context}\n");
    }

    let initial_message = match user_context {
        Some(_) => {
            "Inicie a conversa de forma casual mencionando o que você sabe sobre mim e recomende uma música!"
        }
        None => {
            "Olá! Me apresente de forma amigável e pergunte sobre meu nome e preferências musicais."
        }
    };
    let greeting = graph.invoke(
        Input {
            messages: vec![Message::Human(initial_message.into())],
            user_context,
            user_id: Some(actual_user_id.clone()),
        },
        &config,
    );

    match greeting {
        Ok(result) => println!("AI: {}\n", result.last_text()),
        Err(error) => eprintln!("❌ Erro ao iniciar conversa: {error}"),
    }

    while let Some(user_input) = read_line("Você: ")? {
        if user_input.trim().is_empty() {
            continue;
        }
        if user_input.to_lowercase() == "exit" {
            println!("\n👋 Até mais!\n");
            break;
        }

        let answer = graph.invoke(
            Input {
                messages: vec![Message::Human(user_input)],
                user_context: None,
                user_id: Some(actual_user_id.clone()),
            },
            &config,
        );

        match answer {
            Ok(result) => println!("\nAI: {}\n", result.last_text()),
            Err(error) => {
                eprintln!("\n❌ Erro ao gerar resposta: {error}");
                println!("AI: Desculpe, encontrei um erro. Pode tentar novamente?\n");
            }
        }
    }

    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("\n❌ Erro fatal: {error}");
        std::process::exit(1);
    }
}
