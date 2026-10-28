use mlx_lm_generate::{
    bate_com_gabarito, montar_argumentos_generate, parsear_saida_generate, pasta_do_programa,
    rodar_generate_real, FalhaGenerate, Placar,
};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const PROMPT: &str = "Extraia segurado, placa e valor do orçamento de oficina abaixo.

BOA VISTA REPAROS AUTOMOTIVOS CNPJ 21.098.765/0001-32 Rua dos Mecanicos 310 Segurado: Ricardo Alves Monteiro Placa do veiculo: JBR-9021 Data do sinistro: 09/06/2026 Valor das pecas: R$ 1.850,00 Valor da mao de obra: R$ 970,00 Valor total do orcamento: R$ 2.820,00";

const SAIDA_SEM_ADAPTADOR: &str = "==========
<|channel>thought
Here's a thinking process to extract the requested information:

1.  **Analyze the Request:** The user wants to extract three specific pieces of information from the provided text (an auto repair quote/budget):
==========
Prompt: 155 tokens, 211.031 tokens-per-sec
Generation: 80 tokens, 50.460 tokens-per-sec
Peak memory: 9.447 GB";

const SAIDA_RANK4: &str = "==========
{\"segurado\":\"Ricardo Alves Monteiro\",\"placa\":\"JBR-9021\",\"valor\":2820}
==========
Prompt: 155 tokens, 218.733 tokens-per-sec
Generation: 27 tokens, 41.540 tokens-per-sec
Peak memory: 9.447 GB";

struct Resultado {
    tokens: u32,
    json: Option<Value>,
}

fn gabarito() -> Value {
    json!({ "segurado": "Ricardo Alves Monteiro", "placa": "JBR-9021", "valor": 2820 })
}

fn adapters(pasta: &Path) -> [(&'static str, PathBuf); 3] {
    [
        ("rank 4", pasta.join("mlx-adapters-rank4")),
        ("rank 8", pasta.join("mlx-adapters")),
        ("rank 16", pasta.join("mlx-adapters-rank16")),
    ]
}

fn parsear_saida(texto_saida: &str) -> Result<Resultado, String> {
    let saida = parsear_saida_generate(texto_saida).ok_or("saída fora do formato esperado")?;

    Ok(Resultado {
        tokens: saida.tokens_gerados.unwrap_or(0),
        json: saida.json,
    })
}

fn rodar_real(adapter_path: Option<&Path>) -> Result<Resultado, String> {
    let argumentos = montar_argumentos_generate(PROMPT, adapter_path);
    let saida = rodar_generate_real(&argumentos).map_err(|falha| match falha {
        FalhaGenerate::NaoIniciou(mensagem) => mensagem,
        FalhaGenerate::Saiu { codigo, stderr } => {
            format!("mlx_lm generate falhou ({codigo}):\n{stderr}")
        }
    })?;

    parsear_saida(&saida)
}

fn rodar_testes() -> bool {
    let mut placar = Placar::default();

    println!("== Testes ==");

    placar.testar(
        "sem adaptador: bate no limite de tokens, não chega a JSON",
        || {
            parsear_saida(SAIDA_SEM_ADAPTADOR)
                .is_ok_and(|saida| saida.tokens == 80 && saida.json.is_none())
        },
    );
    placar.testar("rank 4: JSON exato batendo com o gabarito", || {
        parsear_saida(SAIDA_RANK4).is_ok_and(|saida| saida.json == Some(gabarito()))
    });
    placar.testar("bate_com_gabarito confirma e rejeita corretamente", || {
        bate_com_gabarito(Some(&gabarito()), &gabarito())
            && !bate_com_gabarito(Some(&json!({ "segurado": "outro" })), &gabarito())
    });

    placar.imprimir_resumo();
    placar.passou()
}

fn rodar_configuracao(nome: &str, adapter_path: Option<&Path>) -> bool {
    println!("--- {nome} ---");

    match rodar_real(adapter_path) {
        Ok(resultado) => {
            println!(
                "{} tokens, bate com o gabarito? {}",
                resultado.tokens,
                bate_com_gabarito(resultado.json.as_ref(), &gabarito())
            );
            if adapter_path.is_some() {
                if let Some(json) = &resultado.json {
                    println!("{json}");
                }
            }
            true
        }
        Err(erro) => {
            println!("[FALHOU] {erro}");
            false
        }
    }
}

fn rodar_comparacao_real(pasta: &Path) -> Result<(), String> {
    println!("\n===== Boa Vista Reparos Automotivos: sem adaptador vs. rank 4/8/16 =====\n");

    let adapters = adapters(pasta);
    let configuracoes: Vec<(&str, Option<&Path>)> = std::iter::once(("sem adaptador", None))
        .chain(
            adapters
                .iter()
                .map(|(nome, caminho)| (*nome, Some(caminho.as_path()))),
        )
        .collect();
    let sucessos: Vec<bool> = configuracoes
        .iter()
        .map(|(nome, caminho)| rodar_configuracao(nome, *caminho))
        .collect();
    let falhas = sucessos.iter().filter(|sucesso| !**sucesso).count();

    if falhas > 0 {
        println!(
            "\n{falhas}/{} configuração(ões) falharam ao rodar mlx_lm generate.",
            configuracoes.len()
        );
    }

    if falhas == configuracoes.len() {
        return Err(
            "Nenhuma configuração rodou com sucesso -- verifique o modelo/adaptadores locais."
                .to_string(),
        );
    }

    Ok(())
}

fn main() -> ExitCode {
    let testes_passaram = rodar_testes();

    if let Err(erro) = rodar_comparacao_real(&pasta_do_programa()) {
        eprintln!("Erro: {erro}");
        return ExitCode::FAILURE;
    }

    if testes_passaram {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
