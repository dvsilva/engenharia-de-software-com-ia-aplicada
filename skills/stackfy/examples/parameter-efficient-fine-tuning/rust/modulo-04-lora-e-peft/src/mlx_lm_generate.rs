use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const MODELO_BASE: &str = "mlx-community/gemma-4-e2b-it-bf16";
pub const MAX_TOKENS: u32 = 80;

const SEPARADOR: &str = "==========";
const ROTULO_TOKENS: &str = "Generation: ";

pub struct SaidaGenerate {
    pub texto_gerado: String,
    pub tokens_gerados: Option<u32>,
    pub json: Option<Value>,
}

pub enum FalhaGenerate {
    NaoIniciou(String),
    Saiu { codigo: i32, stderr: String },
}

#[derive(Default)]
pub struct Placar {
    total: u32,
    falhas: u32,
}

impl Placar {
    pub fn testar(&mut self, descricao: &str, verificacao: impl FnOnce() -> bool) {
        self.total += 1;
        if verificacao() {
            println!("  [OK] {descricao}");
            return;
        }

        self.falhas += 1;
        println!("  [FALHOU] {descricao}");
    }

    pub fn imprimir_resumo(&self) {
        println!(
            "\n{}/{} testes passaram.",
            self.total - self.falhas,
            self.total
        );
    }

    pub fn passou(&self) -> bool {
        self.falhas == 0
    }
}

pub fn pasta_do_programa() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

pub fn montar_argumentos_generate(prompt: &str, adapter_path: Option<&Path>) -> Vec<String> {
    let mut argumentos: Vec<String> = [
        "-m",
        "mlx_lm",
        "generate",
        "--model",
        MODELO_BASE,
        "--prompt",
        prompt,
        "--max-tokens",
        &MAX_TOKENS.to_string(),
    ]
    .iter()
    .map(|argumento| argumento.to_string())
    .collect();

    if let Some(caminho) = adapter_path {
        argumentos.push("--adapter-path".to_string());
        argumentos.push(caminho.display().to_string());
    }

    argumentos
}

fn extrair_tokens_gerados(texto_saida: &str) -> Option<u32> {
    let inicio = texto_saida.find(ROTULO_TOKENS)? + ROTULO_TOKENS.len();
    let resto = &texto_saida[inicio..];
    let digitos: String = resto.chars().take_while(char::is_ascii_digit).collect();

    if digitos.is_empty() || !resto[digitos.len()..].starts_with(" tokens") {
        return None;
    }

    digitos.parse().ok()
}

pub fn parsear_saida_generate(texto_saida: &str) -> Option<SaidaGenerate> {
    let blocos: Vec<&str> = texto_saida.split(SEPARADOR).collect();
    if blocos.len() < 3 {
        return None;
    }

    let texto_gerado = blocos[1].trim().to_string();
    let json = serde_json::from_str(&texto_gerado).ok();

    Some(SaidaGenerate {
        tokens_gerados: extrair_tokens_gerados(texto_saida),
        texto_gerado,
        json,
    })
}

fn valores_iguais(esquerda: &Value, direita: &Value) -> bool {
    match (esquerda.as_f64(), direita.as_f64()) {
        (Some(numero_esquerda), Some(numero_direita)) => numero_esquerda == numero_direita,
        _ => esquerda == direita,
    }
}

pub fn bate_com_gabarito(json: Option<&Value>, gabarito: &Value) -> bool {
    let (Some(Value::Object(saida)), Value::Object(campos)) = (json, gabarito) else {
        return false;
    };

    campos.iter().all(|(chave, esperado)| {
        saida
            .get(chave)
            .is_some_and(|valor| valores_iguais(valor, esperado))
    })
}

pub fn rodar_generate_real(argumentos: &[String]) -> Result<String, FalhaGenerate> {
    let resultado = Command::new("python3")
        .args(argumentos)
        .output()
        .map_err(|erro| FalhaGenerate::NaoIniciou(erro.to_string()))?;
    let stdout = String::from_utf8_lossy(&resultado.stdout);
    let stderr = String::from_utf8_lossy(&resultado.stderr);

    if !resultado.status.success() {
        return Err(FalhaGenerate::Saiu {
            codigo: resultado.status.code().unwrap_or(1),
            stderr: stderr.into_owned(),
        });
    }

    Ok(format!("{stdout}\n{stderr}"))
}
