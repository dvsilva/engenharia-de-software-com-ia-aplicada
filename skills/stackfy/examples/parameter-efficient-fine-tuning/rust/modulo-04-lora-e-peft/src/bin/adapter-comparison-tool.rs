use mlx_lm_generate::{
    bate_com_gabarito, montar_argumentos_generate, parsear_saida_generate, pasta_do_programa,
    rodar_generate_real, FalhaGenerate, Placar, SaidaGenerate, MAX_TOKENS,
};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::process::ExitCode;

const INDICE_EXEMPLO: usize = 8;
const LIMITE_TEXTO_SEM_ADAPTADOR: usize = 220;

const SAIDA_REAL_SEM_ADAPTADOR: &str = "==========
<|channel>thought
Here's a thinking process to extract the requested information:

1.  **Analyze the Request:** The user wants to extract three specific pieces of information from the provided text (a medical receipt/summary):
    *   Beneficiário (Beneficiary)
    *   Procedimento (Procedure)
    *   Valor (Value/Amount)

2.  **
==========
Prompt: 119 tokens, 119.302 tokens-per-sec
Generation: 80 tokens, 52.503 tokens-per-sec
Peak memory: 9.406 GB";

const SAIDA_REAL_COM_ADAPTADOR: &str = "==========
{\"beneficiario\":\"Felipe Alves Monteiro\",\"procedimento\":\"consulta de clinica geral\",\"valor\":3450}
==========
Prompt: 119 tokens, 161.590 tokens-per-sec
Generation: 28 tokens, 43.129 tokens-per-sec
Peak memory: 9.406 GB";

struct Exemplo {
    prompt: String,
    gabarito: Value,
}

struct Comparacao {
    texto_gerado: String,
    tokens_gerados: Option<u32>,
    json: Option<Value>,
}

impl Comparacao {
    fn bateu_no_limite_de_tokens(&self) -> bool {
        self.tokens_gerados
            .is_some_and(|tokens| tokens >= MAX_TOKENS)
    }

    fn tokens(&self) -> String {
        self.tokens_gerados
            .map_or_else(|| "null".to_string(), |tokens| tokens.to_string())
    }
}

fn carregar_exemplo_teste(pasta: &Path) -> Result<Exemplo, String> {
    let caminho = pasta.join("mlx-data").join("test.jsonl");
    let conteudo =
        fs::read_to_string(&caminho).map_err(|erro| format!("{}: {erro}", caminho.display()))?;
    let linhas: Vec<&str> = conteudo.trim().split('\n').collect();
    let linha = linhas.get(INDICE_EXEMPLO).ok_or_else(|| {
        format!(
            "índice {INDICE_EXEMPLO} fora do intervalo (0-{})",
            linhas.len() - 1
        )
    })?;
    let exemplo: Value = serde_json::from_str(linha).map_err(|erro| erro.to_string())?;
    let prompt = exemplo["messages"][0]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let resposta = exemplo["messages"][1]["content"]
        .as_str()
        .unwrap_or_default();
    let gabarito = serde_json::from_str(resposta).map_err(|erro| erro.to_string())?;

    Ok(Exemplo { prompt, gabarito })
}

fn parsear(texto_saida: &str) -> Result<Comparacao, String> {
    let SaidaGenerate {
        texto_gerado,
        tokens_gerados,
        json,
    } = parsear_saida_generate(texto_saida)
        .ok_or("saída não tem o formato esperado (dois separadores \"==========\")")?;

    Ok(Comparacao {
        texto_gerado,
        tokens_gerados,
        json,
    })
}

fn gerar(prompt: &str, adapter_path: Option<&Path>) -> Result<Comparacao, String> {
    let argumentos = montar_argumentos_generate(prompt, adapter_path);
    let saida = rodar_generate_real(&argumentos).map_err(|falha| match falha {
        FalhaGenerate::NaoIniciou(mensagem) => mensagem,
        FalhaGenerate::Saiu { codigo, stderr } => {
            format!("mlx_lm generate saiu com código {codigo}:\n{stderr}")
        }
    })?;

    parsear(&saida)
}

fn rodar_testes(pasta: &Path) -> bool {
    let mut placar = Placar::default();
    let gabarito = json!({
        "beneficiario": "Felipe Alves Monteiro",
        "procedimento": "consulta de clinica geral",
        "valor": 3450
    });

    println!("== Testes: montagem de argumentos e parsing da saída real ==");

    placar.testar(
        "carrega o exemplo real (índice 8) e é o recibo do Felipe Alves Monteiro",
        || carregar_exemplo_teste(pasta).is_ok_and(|exemplo| exemplo.gabarito == gabarito),
    );
    placar.testar(
        "monta argumentos sem --adapter-path quando não há adaptador",
        || !montar_argumentos_generate("x", None).contains(&"--adapter-path".to_string()),
    );
    placar.testar(
        "monta argumentos com --adapter-path quando há adaptador",
        || {
            montar_argumentos_generate("x", Some(Path::new("/caminho/adapters"))).ends_with(&[
                "--adapter-path".to_string(),
                "/caminho/adapters".to_string(),
            ])
        },
    );
    placar.testar(
        "parseia a saída real SEM adaptador: 80 tokens, bateu no limite, não é JSON",
        || {
            parsear(SAIDA_REAL_SEM_ADAPTADOR).is_ok_and(|saida| {
                saida.tokens_gerados == Some(80)
                    && saida.bateu_no_limite_de_tokens()
                    && saida.json.is_none()
            })
        },
    );
    placar.testar(
        "parseia a saída real COM adaptador: 28 tokens, não bateu no limite, JSON válido",
        || {
            parsear(SAIDA_REAL_COM_ADAPTADOR).is_ok_and(|saida| {
                saida.tokens_gerados == Some(28)
                    && !saida.bateu_no_limite_de_tokens()
                    && saida.json.as_ref() == Some(&gabarito)
            })
        },
    );
    placar.testar(
        "bate_com_gabarito confirma campo a campo quando o JSON é igual ao gabarito",
        || {
            parsear(SAIDA_REAL_COM_ADAPTADOR)
                .is_ok_and(|saida| bate_com_gabarito(saida.json.as_ref(), &gabarito))
        },
    );
    placar.testar(
        "bate_com_gabarito falha sem JSON (caso sem adaptador)",
        || {
            parsear(SAIDA_REAL_SEM_ADAPTADOR).is_ok_and(|saida| {
                !bate_com_gabarito(
                    saida.json.as_ref(),
                    &json!({ "beneficiario": "Felipe Alves Monteiro" }),
                )
            })
        },
    );

    placar.imprimir_resumo();
    placar.passou()
}

fn rodar_comparacao_real(pasta: &Path) -> Result<(), String> {
    let exemplo = carregar_exemplo_teste(pasta)?;
    let adapter_path = pasta.join("mlx-adapters");
    let inicio_do_prompt: Vec<&str> = exemplo.prompt.split('\n').take(2).collect();

    println!("\n===== Demo parte 3: mesmo exemplo real, com e sem o adaptador =====\n");
    println!("Exemplo (índice 8, mlx-data/test.jsonl):");
    println!("{} ...\n", inicio_do_prompt.join(" "));

    println!("Rodando SEM adaptador (carrega o modelo, ~15-20s)...");
    let sem_adaptador = gerar(&exemplo.prompt, None)?;

    println!("Rodando COM adaptador (~15-20s)...");
    let com_adaptador = gerar(&exemplo.prompt, Some(&adapter_path))?;

    let acertou_sem = bate_com_gabarito(sem_adaptador.json.as_ref(), &exemplo.gabarito);
    let acertou_com = bate_com_gabarito(com_adaptador.json.as_ref(), &exemplo.gabarito);
    let texto_sem: String = sem_adaptador
        .texto_gerado
        .chars()
        .take(LIMITE_TEXTO_SEM_ADAPTADOR)
        .collect();
    let truncado = sem_adaptador.texto_gerado.chars().count() > LIMITE_TEXTO_SEM_ADAPTADOR;
    let aviso_limite = if sem_adaptador.bateu_no_limite_de_tokens() {
        " -- bateu no limite, não terminou"
    } else {
        ""
    };

    println!("\n--- SEM adaptador ---");
    println!("{} tokens gerados{aviso_limite}", sem_adaptador.tokens());
    println!("{texto_sem}{}", if truncado { "..." } else { "" });
    println!("Bate com o gabarito? {acertou_sem}");

    println!("\n--- COM adaptador ---");
    println!("{} tokens gerados", com_adaptador.tokens());
    println!("{}", com_adaptador.texto_gerado);
    println!("Bate com o gabarito? {acertou_com}");

    println!(
        "\nConclusão: {} tokens de diferença de configuração (o adaptador de 26MB) são a diferença entre um modelo que {} e um modelo que acerta o formato inteiro, campo a campo, num exemplo que nunca esteve no treino.",
        com_adaptador.tokens(),
        if acertou_sem { "também acerta" } else { "não chega a um JSON" }
    );

    Ok(())
}

fn main() -> ExitCode {
    let pasta = pasta_do_programa();
    let testes_passaram = rodar_testes(&pasta);

    if let Err(erro) = rodar_comparacao_real(&pasta) {
        eprintln!("Erro: {erro}");
        return ExitCode::FAILURE;
    }

    if testes_passaram {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
