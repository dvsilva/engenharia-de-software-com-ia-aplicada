use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::time::Duration;

const MODELO: &str = "gemma4:e2b";
const TAMANHO_GRUPO: usize = 6;
const TEMPERATURA: f64 = 1.0;
const EPS: f64 = 1e-4;

const DOCUMENTO_SINISTRO: &str = "
Amplitude Seguros - Comunicado de Sinistro (documento digitalizado, OCR, scan parcialmente ilegivel)
Ref. anterior (cancelada): AS-2Q25-0988zi
Apolice vigente: A5-2026-1l44/7 (numero de dificil leitura no scan)
Segurado: M4rcos Vin1cius Alm3ida Te1xeira (OCR com ruido no nome)
Tipo de sinistro: Colisao veicular (ou possivelmente \"Colisao e furto\", trecho cortado)
Data do incidente: 12/O7/2026 ou 17/02/2026 (data ambigua, dois carimbos sobrepostos)
Valor estimado do reparo: R$ 8.45O,OO (sujeito a pericia, valor preliminar)
Status atual: Em analise pericial
";

enum Esperado {
    Texto(&'static str),
    Numero(f64),
}

const GABARITO: [(&str, Esperado); 6] = [
    (
        "claimant_name",
        Esperado::Texto("Marcos Vinícius Almeida Teixeira"),
    ),
    ("claim_type", Esperado::Texto("Colisao veicular")),
    ("incident_date", Esperado::Texto("12/07/2026")),
    ("estimated_amount_brl", Esperado::Numero(8450.0)),
    ("status", Esperado::Texto("Em analise pericial")),
    ("prioridade", Esperado::Texto("alta")),
];

struct Grupo {
    vantagens: Vec<f64>,
    media: f64,
    desvio: f64,
}

#[derive(Default)]
struct Placar {
    total: u32,
    falhas: u32,
}

impl Placar {
    fn testar(&mut self, descricao: &str, verificacao: impl FnOnce() -> bool) {
        self.total += 1;
        if verificacao() {
            println!("  [OK] {descricao}");
            return;
        }

        self.falhas += 1;
        println!("  [FALHOU] {descricao}");
    }
}

fn prompt_schema() -> String {
    format!(
        "Extraia os dados do documento abaixo e responda APENAS com um JSON
valido, sem nenhum texto adicional, seguindo exatamente este schema:
{{\"claimant_name\": string, \"claim_type\": string, \"incident_date\": \"DD/MM/AAAA\",
\"estimated_amount_brl\": number, \"status\": string,
\"prioridade\": \"alta se estimated_amount_brl > 5000, senao baixa\"}}

Documento:
{DOCUMENTO_SINISTRO}
"
    )
}

fn ollama_url() -> String {
    let host =
        std::env::var("OLLAMA_HOST").unwrap_or_else(|_| "http://localhost:11434".to_string());
    let host = if host.contains("://") {
        host
    } else {
        format!("http://{host}")
    };

    format!("{}/api/generate", host.trim_end_matches('/'))
}

fn chamar_ollama(
    cliente: &Client,
    url: &str,
    prompt: &str,
    temperatura: f64,
) -> Result<String, String> {
    let corpo = json!({
        "model": MODELO,
        "prompt": prompt,
        "stream": false,
        "options": { "temperature": temperatura },
    });
    let resposta = cliente
        .post(url)
        .json(&corpo)
        .send()
        .map_err(|erro| erro.to_string())?;
    let status = resposta.status();
    if !status.is_success() {
        return Err(format!(
            "Ollama respondeu {} {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or("")
        ));
    }
    let dados: Value = resposta.json().map_err(|erro| erro.to_string())?;

    Ok(dados["response"].as_str().unwrap_or_default().to_string())
}

fn extrair_json(texto: &str) -> Option<Value> {
    let inicio = texto.find('{')?;
    let fim = texto.rfind('}')?;
    if fim < inicio {
        return None;
    }

    serde_json::from_str(&texto[inicio..=fim]).ok()
}

fn como_numero(obtido: Option<&Value>) -> f64 {
    match obtido {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(valor)) => f64::from(u8::from(*valor)),
        Some(Value::Number(numero)) => numero.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(texto)) if texto.trim().is_empty() => 0.0,
        Some(Value::String(texto)) => texto.trim().parse().unwrap_or(f64::NAN),
        Some(_) => f64::NAN,
    }
}

fn como_texto(obtido: Option<&Value>) -> String {
    match obtido {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(texto)) => texto.clone(),
        Some(outro) => outro.to_string(),
    }
}

fn bate(obtido: Option<&Value>, esperado: &Esperado) -> bool {
    match esperado {
        Esperado::Numero(valor) => (como_numero(obtido) - valor).abs() < 0.01,
        Esperado::Texto(valor) => {
            como_texto(obtido).trim().to_lowercase() == valor.trim().to_lowercase()
        }
    }
}

fn recompensa_verificavel(candidato: Option<&Value>) -> f64 {
    let Some(candidato) = candidato else {
        return 0.0;
    };
    let acertos = GABARITO
        .iter()
        .filter(|(campo, esperado)| bate(candidato.get(campo), esperado))
        .count();

    acertos as f64 / GABARITO.len() as f64
}

fn vantagem_relativa_ao_grupo(recompensas: &[f64]) -> Grupo {
    let quantidade = recompensas.len() as f64;
    let media = recompensas.iter().sum::<f64>() / quantidade;
    let variancia = recompensas
        .iter()
        .map(|recompensa| (recompensa - media).powi(2))
        .sum::<f64>()
        / quantidade;
    let desvio = variancia.sqrt();
    let desvio_efetivo = if desvio > 0.0 { desvio } else { EPS };
    let vantagens = recompensas
        .iter()
        .map(|recompensa| (recompensa - media) / desvio_efetivo)
        .collect();

    Grupo {
        vantagens,
        media,
        desvio,
    }
}

fn json_como_javascript(valor: Option<&Value>) -> String {
    match valor {
        None => "undefined".to_string(),
        Some(Value::Number(numero)) => numero_como_javascript(numero.as_f64().unwrap_or(f64::NAN)),
        Some(outro) => outro.to_string(),
    }
}

fn numero_como_javascript(numero: f64) -> String {
    if numero.fract() == 0.0 && numero.abs() < 1e21 {
        return format!("{numero:.0}");
    }

    numero.to_string()
}

fn esperado_como_json(esperado: &Esperado) -> String {
    match esperado {
        Esperado::Texto(texto) => Value::from(*texto).to_string(),
        Esperado::Numero(numero) => numero_como_javascript(*numero),
    }
}

fn divergencias(candidato: &Value) -> Vec<String> {
    GABARITO
        .iter()
        .filter(|(campo, esperado)| !bate(candidato.get(campo), esperado))
        .map(|(campo, esperado)| {
            format!(
                "{campo}={} (gabarito={})",
                json_como_javascript(candidato.get(campo)),
                esperado_como_json(esperado)
            )
        })
        .collect()
}

fn gabarito_como_json() -> Value {
    Value::Object(
        GABARITO
            .iter()
            .map(|(campo, esperado)| {
                let valor = match esperado {
                    Esperado::Texto(texto) => Value::from(*texto),
                    Esperado::Numero(numero) => Value::from(*numero),
                };
                (campo.to_string(), valor)
            })
            .collect(),
    )
}

fn com_campo(campo: &str, valor: Value) -> Value {
    let mut candidato = gabarito_como_json();
    candidato[campo] = valor;
    candidato
}

fn rodar_testes() {
    let mut placar = Placar::default();

    println!("== Testes: extração de JSON ==");
    placar.testar("extrai JSON cercado de texto solto", || {
        extrair_json("texto antes {\"a\": 1, \"b\": 2} texto depois")
            == Some(json!({ "a": 1, "b": 2 }))
    });
    placar.testar("retorna null quando não há JSON", || {
        extrair_json("isso nao tem json nenhum").is_none()
    });
    placar.testar(
        "retorna null pra JSON malformado, não lança exceção",
        || extrair_json("{\"a\": invalido}").is_none(),
    );

    println!();
    println!("== Testes: recompensa verificável ==");
    placar.testar(
        "candidato idêntico ao gabarito recebe recompensa 1.0",
        || recompensa_verificavel(Some(&gabarito_como_json())) == 1.0,
    );
    placar.testar("candidato sem JSON válido recebe recompensa 0.0", || {
        recompensa_verificavel(None) == 0.0
    });
    placar.testar(
        "um campo errado em seis reduz a recompensa proporcionalmente (5/6)",
        || {
            let parcial = com_campo("status", json!("campo errado"));
            (recompensa_verificavel(Some(&parcial)) - 5.0 / 6.0).abs() < 1e-9
        },
    );
    placar.testar(
        "diferença de arredondamento (<0,01) no valor ainda conta como acerto",
        || {
            let candidato = com_campo("estimated_amount_brl", json!(8450.001));
            recompensa_verificavel(Some(&candidato)) == 1.0
        },
    );

    println!();
    println!("== Testes: vantagem relativa ao grupo (GRPO) ==");
    placar.testar(
        "grupo com variância real: melhor recompensa vira vantagem positiva, pior vira negativa",
        || {
            let grupo = vantagem_relativa_ao_grupo(&[1.0, 0.5, 0.0]);
            (grupo.media - 0.5).abs() < 1e-9
                && grupo.vantagens[0] > 0.0
                && grupo.vantagens[2] < 0.0
                && grupo.vantagens[1].abs() < 1e-9
        },
    );
    placar.testar(
        "grupo degenerado (todas as recompensas iguais) produz vantagem zero em todo mundo, sem dividir por zero",
        || {
            let grupo = vantagem_relativa_ao_grupo(&[0.83, 0.83, 0.83, 0.83]);
            grupo.desvio == 0.0 && grupo.vantagens.iter().all(|vantagem| *vantagem == 0.0)
        },
    );
    placar.testar(
        "recompensas iguais dentro do grupo recebem exatamente a mesma vantagem",
        || {
            let grupo = vantagem_relativa_ao_grupo(&[1.0, 1.0, 0.0, 0.0]);
            grupo.vantagens[0] == grupo.vantagens[1]
                && grupo.vantagens[2] == grupo.vantagens[3]
                && grupo.vantagens[0] > grupo.vantagens[2]
        },
    );

    println!();
    println!(
        "Total: {} teste(s), {} passou(passaram), {} falhou(falharam).",
        placar.total,
        placar.total - placar.falhas,
        placar.falhas
    );
}

fn interpretacao(vantagem: f64) -> &'static str {
    if vantagem > 0.0 {
        return "reforçaria essa resposta (A>0)";
    }
    if vantagem < 0.0 {
        return "penalizaria essa resposta (A<0)";
    }

    "neutro (A=0)"
}

fn imprimir_grupo(recompensas: &[f64]) {
    let grupo = vantagem_relativa_ao_grupo(recompensas);

    println!(
        "\nGrupo completo: media(r)={:.3}  desvio_padrao(r)={:.3}",
        grupo.media, grupo.desvio
    );
    println!();
    if grupo.desvio == 0.0 {
        println!("GRUPO DEGENERADO: todas as G respostas receberam a mesma recompensa.");
        println!("Isso NÃO é um bug deste script -- é um limite real e documentado do GRPO:");
        println!("quando o grupo inteiro acerta (ou erra) igual, a vantagem de todo mundo");
        println!("vira zero e o sinal de aprendizado desaparece nessa rodada. O paper DAPO");
        println!("(Yu et al., arXiv 2503.14476) descreve exatamente esse caso e propõe");
        println!("'amostragem dinâmica' como correção: descartar grupos unânimes e");
        println!("re-amostrar até achar um grupo com variância real.");
    } else {
        println!(
            "{:>2}  {:>10}  {:>13}  interpretação",
            "i", "recompensa", "vantagem A_i"
        );
        println!("{}", "-".repeat(74));
        for (posicao, (recompensa, vantagem)) in
            recompensas.iter().zip(&grupo.vantagens).enumerate()
        {
            println!(
                "{posicao:>2}  {recompensa:>10.2}  {vantagem:>13.3}  {}",
                interpretacao(*vantagem)
            );
        }
    }

    println!();
    println!("A_i = (r_i - média(r)) / desvio_padrão(r) é o sinal que o GRPO usa pra");
    println!("atualizar a política -- o próprio grupo vira a linha de base, sem precisar");
    println!("de um modelo de valor (critic) separado como no PPO/RLHF clássico.");
    println!("Nenhum peso do modelo foi atualizado por este script -- fim do demo.");
}

fn main() {
    let url = ollama_url();
    let prompt = prompt_schema();
    let cliente = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .expect("cliente HTTP");

    rodar_testes();
    println!();
    println!("== Amostragem real de grupo (o passo que o GRPO chama de 'rollout') ==");
    println!(
        "Modelo: {MODELO}  |  tamanho do grupo G={TAMANHO_GRUPO}  |  temperatura={TEMPERATURA}"
    );
    println!("Mesma pergunta, G respostas reais e independentes, geradas agora, sem cache.\n");

    if let Err(erro) = chamar_ollama(&cliente, &url, "teste de conexao", 0.1) {
        println!("Não foi possível conectar ao Ollama local em {url}: {erro}");
        println!("Rode 'ollama serve' e confirme que o modelo '{MODELO}' está disponível ('ollama list').");
        return;
    }

    let mut recompensas = Vec::new();
    for posicao in 0..TAMANHO_GRUPO {
        let bruto = match chamar_ollama(&cliente, &url, &prompt, TEMPERATURA) {
            Ok(bruto) => bruto,
            Err(erro) => {
                println!("  [{posicao}] chamada ao Ollama falhou ({erro}) -- pulando esta amostra do grupo.");
                continue;
            }
        };
        let candidato = extrair_json(&bruto);
        let recompensa = recompensa_verificavel(candidato.as_ref());
        let lista = candidato.as_ref().map(divergencias).unwrap_or_default();
        recompensas.push(recompensa);
        println!(
            "  [{posicao}] recompensa={recompensa:.2}  json_valido={}  divergencias={}",
            candidato.is_some(),
            Value::from(lista)
        );
    }

    if recompensas.is_empty() {
        println!(
            "\nNenhuma amostra completou (todas as chamadas ao Ollama falharam) -- sem grupo pra calcular vantagem."
        );
        return;
    }

    imprimir_grupo(&recompensas);
}
