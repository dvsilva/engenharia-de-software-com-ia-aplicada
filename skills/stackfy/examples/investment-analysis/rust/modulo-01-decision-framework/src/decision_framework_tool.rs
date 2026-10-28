use serde::Deserialize;
use std::fs;
use std::path::Path;

pub const RECOMENDACAO_FINE_TUNING: &str = "Fine-tuning vale a pena";
pub const RECOMENDACAO_CONTINUAR_PROMPT_RAG: &str =
    "Continue com prompt + RAG. Fine-tuning ainda não.";
pub const RECOMENDACAO_ESPERAR: &str = "Espere acumular dado, depois treine.";
pub const RECOMENDACAO_BLOQUEADO_POR_GOVERNANCA: &str =
    "Bloqueado: resolva a governança do dado antes de reavaliar.";

pub const PERGUNTAS: [&str; 4] = [
    "A tarefa é estreita e repetida, ou aberta e variável?",
    "Já esgotou prompt engineering + RAG + roteamento, sem chegar na qualidade/custo/latência necessários?",
    "Tem dado de exemplo suficiente, diverso e de qualidade pra treinar?",
    "A tarefa é estável o bastante pra não virar esteira de retreino constante?",
];

const INDICE_P3: usize = 2;

const RANDOM_INDEX_N4: f64 = 0.90;

#[derive(Deserialize, Clone, Copy)]
pub struct Triangular {
    pub min: f64,
    pub moda: f64,
    pub max: f64,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct OpcaoReal {
    pub custo_de_erro_esperado_por_chamada: f64,
    pub taxa_crescimento_score_por_mes: f64,
    pub score_alvo: f64,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct Financeiro {
    pub volume_inicial_mensal: f64,
    pub crescimento_mensal: Triangular,
    pub custo_por_chamada_status_quo: Triangular,
    pub custo_por_chamada_fine_tuned: Triangular,
    pub custo_treinamento: f64,
    pub horizonte_meses: u32,
    pub taxa_desconto_mensal: f64,
    pub opcao_real: Option<OpcaoReal>,
}

#[derive(Deserialize, Clone, Copy)]
pub struct Scores {
    pub p1: f64,
    pub p2: f64,
    pub p3: f64,
    pub p4: f64,
}

impl Scores {
    pub fn em_ordem(&self) -> [f64; 4] {
        [self.p1, self.p2, self.p3, self.p4]
    }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Governanca {
    #[serde(rename = "dadoSensivelLGPD")]
    pub dado_sensivel_lgpd: bool,
    pub base_legal_definida: bool,
    #[serde(default)]
    pub base_legal_descricao: String,
    pub dpa_assinado: bool,
}

#[derive(Deserialize, Clone)]
pub struct Caso {
    pub id: String,
    pub nome: String,
    pub tarefa: String,
    pub scores: Scores,
    pub governanca: Governanca,
    pub financeiro: Option<Financeiro>,
}

#[derive(Deserialize)]
pub struct Ahp {
    pub matriz: Vec<Vec<f64>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Configuracao {
    pub limiar_verde: f64,
    pub ahp: Ahp,
    pub casos: Vec<Caso>,
}

impl Configuracao {
    pub fn caso(&self, id: &str) -> &Caso {
        self.casos
            .iter()
            .find(|caso| caso.id == id)
            .unwrap_or_else(|| panic!("caso {id} ausente de amplitude-seguros-casos.json"))
    }
}

pub struct ResultadoGovernanca {
    pub aprovado: bool,
    pub motivos: Vec<String>,
}

pub struct RiscoOperacional {
    pub provedor: &'static str,
    pub status: &'static str,
    pub detalhe: &'static str,
    pub fonte: &'static str,
}

const RISCOS_OPERACIONAIS_PROVEDOR: [RiscoOperacional; 2] = [
    RiscoOperacional {
        provedor: "OpenAI self-serve (platform.openai.com)",
        status: "Descontinuando",
        detalhe: "Orgs novas já bloqueadas pra criar job desde 7/mai/2026; quem não usa há 60 dias perde acesso em 2/jul/2026; fecha pra todo mundo em 6/jan/2027.",
        fonte: "developers.openai.com/api/docs/deprecations",
    },
    RiscoOperacional {
        provedor: "Google AI Studio / Gemini API",
        status: "Morto",
        detalhe: "Fine-tuning descontinuado desde maio/2025. Gemini 1.5 Flash-001 foi o último modelo suportado.",
        fonte: "ai.google.dev/gemini-api/docs/model-tuning",
    },
];

pub struct Consistencia {
    pub lambda_max: f64,
    pub ci: f64,
    pub cr: f64,
    pub consistente: bool,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Sinal {
    Verde,
    Vermelho,
}

impl Sinal {
    pub fn rotulo(self) -> &'static str {
        match self {
            Sinal::Verde => "VERDE",
            Sinal::Vermelho => "VERMELHO",
        }
    }
}

pub struct Avaliacao {
    pub aprovado: bool,
    pub falha_so_dado: bool,
    pub decisao_tecnica_em_aberto: bool,
    pub recomendacao: &'static str,
    pub perguntas_falhas: Vec<usize>,
    pub score_composto: f64,
    pub sinais_por_pergunta: [(f64, Sinal); 4],
}

pub enum ResultadoCompleto {
    BloqueadoPorGovernanca { motivos: Vec<String> },
    Avaliado(Avaliacao),
}

impl ResultadoCompleto {
    pub fn aprovado(&self) -> bool {
        match self {
            ResultadoCompleto::BloqueadoPorGovernanca { .. } => false,
            ResultadoCompleto::Avaliado(avaliacao) => avaliacao.aprovado,
        }
    }
}

type CampoVariavel = fn(&mut ParamsNpv) -> &mut f64;

#[derive(Clone, Copy)]
pub struct ParamsNpv {
    pub volume_inicial_mensal: f64,
    pub crescimento_mensal: f64,
    pub custo_por_chamada_status_quo: f64,
    pub custo_por_chamada_fine_tuned: f64,
    pub custo_treinamento: f64,
    pub horizonte_meses: u32,
    pub taxa_desconto_mensal: f64,
    pub atraso_meses: u32,
}

pub struct Fluxo {
    pub mes: u32,
    pub volume: f64,
    pub economia_descontada: f64,
    pub npv_acumulado: f64,
}

pub struct Npv {
    pub npv: f64,
    pub mes_breakeven: Option<u32>,
    pub fluxos: Vec<Fluxo>,
}

pub struct MonteCarlo {
    pub media: f64,
    pub p5: f64,
    pub p50: f64,
    pub p95: f64,
    pub probabilidade_positivo: f64,
    pub n: usize,
}

pub struct OpcaoDeEsperar {
    pub meses_para_esperar: u32,
    pub sigma: f64,
    pub u: f64,
    pub d: f64,
    pub probabilidade_risco_neutra: f64,
    pub valor_presente_fluxos_brutos: f64,
    pub valor_exercer_agora: f64,
    pub valor_opcao_esperar: f64,
    pub valor_de_esperar: f64,
    pub recomendacao: &'static str,
    pub reavaliacao_agendada_em: &'static str,
}

pub struct Sensibilidade {
    pub parametro: &'static str,
    pub npv_baixo: f64,
    pub npv_alto: f64,
    pub amplitude: f64,
}

pub fn arredondar(valor: f64, casas: usize) -> f64 {
    format!("{valor:.casas$}").parse().unwrap_or(valor)
}

pub fn carregar_configuracao() -> Result<Configuracao, String> {
    let caminho = Path::new(env!("CARGO_MANIFEST_DIR")).join("amplitude-seguros-casos.json");
    let bruto =
        fs::read_to_string(&caminho).map_err(|erro| format!("{}: {erro}", caminho.display()))?;

    serde_json::from_str(&bruto).map_err(|erro| format!("{}: {erro}", caminho.display()))
}

pub fn validar_governanca_dado(governanca: &Governanca) -> ResultadoGovernanca {
    let mut motivos = Vec::new();

    if !governanca.base_legal_definida {
        motivos
            .push("sem base legal definida pro tratamento do dado (LGPD Art. 7º/11)".to_string());
    }
    if governanca.dado_sensivel_lgpd && !governanca.dpa_assinado {
        motivos.push(
            "dado de categoria sensível (LGPD Art. 5º, II) sem DPA assinado com o provedor de fine-tuning"
                .to_string(),
        );
    }

    ResultadoGovernanca {
        aprovado: motivos.is_empty(),
        motivos,
    }
}

pub fn listar_riscos_operacionais_provedor() -> &'static [RiscoOperacional] {
    &RISCOS_OPERACIONAIS_PROVEDOR
}

pub fn derivar_pesos_ahp(matriz: &[Vec<f64>]) -> Vec<f64> {
    let n = matriz.len() as f64;
    let medias_geometricas: Vec<f64> = matriz
        .iter()
        .map(|linha| linha.iter().product::<f64>().powf(1.0 / n))
        .collect();
    let soma: f64 = medias_geometricas.iter().sum();

    medias_geometricas
        .iter()
        .map(|media| media / soma)
        .collect()
}

pub fn calcular_consistencia_ahp(matriz: &[Vec<f64>], pesos: &[f64]) -> Consistencia {
    let n = matriz.len() as f64;
    let aplicada: Vec<f64> = matriz
        .iter()
        .map(|linha| {
            linha
                .iter()
                .zip(pesos)
                .map(|(valor, peso)| valor * peso)
                .sum()
        })
        .collect();
    let lambda_max = aplicada
        .iter()
        .zip(pesos)
        .map(|(valor, peso)| valor / peso)
        .sum::<f64>()
        / n;
    let ci = (lambda_max - n) / (n - 1.0);
    let cr = ci / RANDOM_INDEX_N4;

    Consistencia {
        lambda_max,
        ci,
        cr,
        consistente: cr < 0.10,
    }
}

pub fn agregar_matrizes_comite(matrizes: &[Vec<Vec<f64>>]) -> Vec<Vec<f64>> {
    let avaliadores = matrizes.len() as f64;
    let n = matrizes[0].len();

    (0..n)
        .map(|linha| {
            (0..n)
                .map(|coluna| {
                    matrizes
                        .iter()
                        .map(|matriz| matriz[linha][coluna])
                        .product::<f64>()
                        .powf(1.0 / avaliadores)
                })
                .collect()
        })
        .collect()
}

pub fn avaliar_framework(scores: &Scores, pesos: &[f64], limiar_verde: f64) -> Avaliacao {
    let valores = scores.em_ordem();
    let sinais_por_pergunta = valores.map(|score| {
        let sinal = if score >= limiar_verde {
            Sinal::Verde
        } else {
            Sinal::Vermelho
        };
        (score, sinal)
    });
    let perguntas_falhas: Vec<usize> = sinais_por_pergunta
        .iter()
        .enumerate()
        .filter(|(_, (_, sinal))| *sinal == Sinal::Vermelho)
        .map(|(indice, _)| indice + 1)
        .collect();
    let score_composto: f64 = valores
        .iter()
        .zip(pesos)
        .map(|(score, peso)| score * peso)
        .sum();
    let aprovado = perguntas_falhas.is_empty();

    Avaliacao {
        aprovado,
        falha_so_dado: perguntas_falhas == [INDICE_P3 + 1],
        decisao_tecnica_em_aberto: aprovado,
        recomendacao: if aprovado {
            RECOMENDACAO_FINE_TUNING
        } else {
            RECOMENDACAO_CONTINUAR_PROMPT_RAG
        },
        perguntas_falhas,
        score_composto: arredondar(score_composto, 4),
        sinais_por_pergunta,
    }
}

pub fn avaliar_caso_completo(caso: &Caso, pesos: &[f64], limiar_verde: f64) -> ResultadoCompleto {
    let governanca = validar_governanca_dado(&caso.governanca);
    if !governanca.aprovado {
        return ResultadoCompleto::BloqueadoPorGovernanca {
            motivos: governanca.motivos,
        };
    }

    ResultadoCompleto::Avaliado(avaliar_framework(&caso.scores, pesos, limiar_verde))
}

pub fn params_deterministicos(financeiro: &Financeiro) -> ParamsNpv {
    ParamsNpv {
        volume_inicial_mensal: financeiro.volume_inicial_mensal,
        crescimento_mensal: financeiro.crescimento_mensal.moda,
        custo_por_chamada_status_quo: financeiro.custo_por_chamada_status_quo.moda,
        custo_por_chamada_fine_tuned: financeiro.custo_por_chamada_fine_tuned.moda,
        custo_treinamento: financeiro.custo_treinamento,
        horizonte_meses: financeiro.horizonte_meses,
        taxa_desconto_mensal: financeiro.taxa_desconto_mensal,
        atraso_meses: 0,
    }
}

pub fn calcular_npv(params: &ParamsNpv) -> Npv {
    let mut npv = -params.custo_treinamento;
    let mut volume = params.volume_inicial_mensal;
    let mut mes_breakeven = None;
    let mut fluxos = Vec::new();

    for mes in 1..=params.horizonte_meses {
        volume *= 1.0 + params.crescimento_mensal;
        let mut economia_descontada = 0.0;
        if mes > params.atraso_meses {
            let economia_mes = volume
                * (params.custo_por_chamada_status_quo - params.custo_por_chamada_fine_tuned);
            economia_descontada =
                economia_mes / (1.0 + params.taxa_desconto_mensal).powi(mes as i32);
            npv += economia_descontada;
        }
        if mes_breakeven.is_none() && npv > 0.0 {
            mes_breakeven = Some(mes);
        }
        fluxos.push(Fluxo {
            mes,
            volume,
            economia_descontada,
            npv_acumulado: npv,
        });
    }

    Npv {
        npv: arredondar(npv, 2),
        mes_breakeven,
        fluxos,
    }
}

pub fn amostrar_triangular(min: f64, moda: f64, max: f64, rng: &mut dyn FnMut() -> f64) -> f64 {
    let u = rng();
    let fracao = (moda - min) / (max - min);
    if u < fracao {
        return min + (u * (max - min) * (moda - min)).sqrt();
    }

    max - ((1.0 - u) * (max - min) * (max - moda)).sqrt()
}

fn amostrar(estimativa: &Triangular, rng: &mut dyn FnMut() -> f64) -> f64 {
    amostrar_triangular(estimativa.min, estimativa.moda, estimativa.max, rng)
}

pub fn percentil(valores_ordenados: &[f64], p: f64) -> f64 {
    let indice =
        ((p * valores_ordenados.len() as f64).floor() as usize).min(valores_ordenados.len() - 1);
    valores_ordenados[indice]
}

fn params_amostrados(financeiro: &Financeiro, rng: &mut dyn FnMut() -> f64) -> ParamsNpv {
    ParamsNpv {
        crescimento_mensal: amostrar(&financeiro.crescimento_mensal, rng),
        custo_por_chamada_status_quo: amostrar(&financeiro.custo_por_chamada_status_quo, rng),
        custo_por_chamada_fine_tuned: amostrar(&financeiro.custo_por_chamada_fine_tuned, rng),
        ..params_deterministicos(financeiro)
    }
}

pub fn simular_monte_carlo(
    financeiro: &Financeiro,
    n: usize,
    rng: &mut dyn FnMut() -> f64,
) -> MonteCarlo {
    let mut resultados: Vec<f64> = (0..n)
        .map(|_| calcular_npv(&params_amostrados(financeiro, rng)).npv)
        .collect();
    resultados.sort_by(f64::total_cmp);
    let media = resultados.iter().sum::<f64>() / n as f64;
    let positivos = resultados.iter().filter(|valor| **valor > 0.0).count();

    MonteCarlo {
        media: arredondar(media, 2),
        p5: arredondar(percentil(&resultados, 0.05), 2),
        p50: arredondar(percentil(&resultados, 0.50), 2),
        p95: arredondar(percentil(&resultados, 0.95), 2),
        probabilidade_positivo: arredondar(positivos as f64 / n as f64, 4),
        n,
    }
}

pub fn calcular_valor_presente_fluxos(params: &ParamsNpv) -> f64 {
    calcular_npv(params).npv + params.custo_treinamento
}

pub fn derivar_volatilidade(
    financeiro: &Financeiro,
    n: usize,
    rng: &mut dyn FnMut() -> f64,
) -> f64 {
    let mut valores: Vec<f64> = (0..n)
        .map(|_| calcular_valor_presente_fluxos(&params_amostrados(financeiro, rng)))
        .collect();
    valores.sort_by(f64::total_cmp);
    let mediana = percentil(&valores, 0.5);
    let log_retornos: Vec<f64> = valores
        .iter()
        .filter(|valor| **valor > 0.0 && mediana > 0.0)
        .map(|valor| (valor / mediana).ln())
        .collect();
    let quantidade = log_retornos.len() as f64;
    let media = log_retornos.iter().sum::<f64>() / quantidade;
    let variancia = log_retornos
        .iter()
        .map(|valor| (valor - media).powi(2))
        .sum::<f64>()
        / (quantidade - 1.0);

    variancia.sqrt()
}

pub fn precificar_opcao_de_esperar(
    financeiro: &Financeiro,
    score_atual_p3: f64,
    n: usize,
    rng: &mut dyn FnMut() -> f64,
) -> OpcaoDeEsperar {
    let opcao_real = financeiro
        .opcao_real
        .expect("opcaoReal ausente do caso reprovado só por dado");
    let meses_para_esperar = ((opcao_real.score_alvo - score_atual_p3)
        / opcao_real.taxa_crescimento_score_por_mes)
        .ceil() as u32;
    let custo_treinamento = financeiro.custo_treinamento;
    let s0 = calcular_valor_presente_fluxos(&params_deterministicos(financeiro));
    let sigma = derivar_volatilidade(financeiro, n, rng);
    let r = financeiro.taxa_desconto_mensal;
    let u = sigma.exp();
    let d = 1.0 / u;
    let p = (r.exp() - d) / (u - d);

    let mut valores_opcao: Vec<f64> = (0..=meses_para_esperar)
        .map(|j| {
            let s_final = s0 * u.powi((meses_para_esperar - j) as i32) * d.powi(j as i32);
            (s_final - custo_treinamento).max(0.0)
        })
        .collect();
    for passo in (1..=meses_para_esperar as usize).rev() {
        valores_opcao = (0..passo)
            .map(|j| (p * valores_opcao[j] + (1.0 - p) * valores_opcao[j + 1]) / r.exp())
            .collect();
    }
    let valor_opcao_esperar = arredondar(valores_opcao[0], 2);

    let s_agora = calcular_valor_presente_fluxos(&ParamsNpv {
        custo_por_chamada_fine_tuned: financeiro.custo_por_chamada_fine_tuned.moda
            + opcao_real.custo_de_erro_esperado_por_chamada,
        ..params_deterministicos(financeiro)
    });
    let valor_exercer_agora = arredondar((s_agora - custo_treinamento).max(0.0), 2);
    let valor_de_esperar = arredondar(valor_opcao_esperar - valor_exercer_agora, 2);

    OpcaoDeEsperar {
        meses_para_esperar,
        sigma: arredondar(sigma, 4),
        u: arredondar(u, 4),
        d: arredondar(d, 4),
        probabilidade_risco_neutra: arredondar(p, 4),
        valor_presente_fluxos_brutos: arredondar(s0, 2),
        valor_exercer_agora,
        valor_opcao_esperar,
        valor_de_esperar,
        recomendacao: if valor_de_esperar > 0.0 {
            RECOMENDACAO_ESPERAR
        } else {
            RECOMENDACAO_FINE_TUNING
        },
        reavaliacao_agendada_em: "Módulo 3.2",
    }
}

pub fn analisar_sensibilidade(
    financeiro: &Financeiro,
    percentual_variacao: f64,
) -> Vec<Sensibilidade> {
    let base = params_deterministicos(financeiro);
    let variaveis: [(&'static str, CampoVariavel); 4] = [
        ("crescimentoMensal", |params| &mut params.crescimento_mensal),
        ("custoPorChamadaStatusQuo", |params| {
            &mut params.custo_por_chamada_status_quo
        }),
        ("custoPorChamadaFineTuned", |params| {
            &mut params.custo_por_chamada_fine_tuned
        }),
        ("custoTreinamento", |params| &mut params.custo_treinamento),
    ];
    let variar = |campo: CampoVariavel, fator: f64| {
        let mut params = base;
        *campo(&mut params) *= fator;
        calcular_npv(&params).npv
    };

    let mut resultado: Vec<Sensibilidade> = variaveis
        .into_iter()
        .map(|(parametro, campo)| {
            let npv_baixo = variar(campo, 1.0 - percentual_variacao);
            let npv_alto = variar(campo, 1.0 + percentual_variacao);
            Sensibilidade {
                parametro,
                npv_baixo,
                npv_alto,
                amplitude: arredondar((npv_alto - npv_baixo).abs(), 2),
            }
        })
        .collect();
    resultado.sort_by(|esquerda, direita| direita.amplitude.total_cmp(&esquerda.amplitude));

    resultado
}

pub fn gerador_padrao() -> impl FnMut() -> f64 {
    rand::random::<f64>
}

#[derive(Default)]
pub struct Placar {
    pub total: u32,
    pub falhas: u32,
}

impl Placar {
    pub fn testar(&mut self, descricao: &str, verificacao: impl FnOnce() -> Result<(), String>) {
        self.total += 1;
        match verificacao() {
            Ok(()) => println!("  [OK] {descricao}"),
            Err(mensagem) => {
                self.falhas += 1;
                println!("  [FALHOU] {descricao}");
                println!("           {mensagem}");
            }
        }
    }

    pub fn resumo(&self, rotulo: &str) -> String {
        format!(
            "{rotulo}: {} teste(s), {} passou(passaram), {} falhou(falharam).",
            self.total,
            self.total - self.falhas,
            self.falhas
        )
    }
}

pub fn garantir(condicao: bool, mensagem: impl FnOnce() -> String) -> Result<(), String> {
    if condicao {
        return Ok(());
    }

    Err(mensagem())
}

pub struct ResultadoTestes {
    pub pesos_ahp: Vec<f64>,
    pub consistencia_ahp: Consistencia,
    pub resultado_auto: Avaliacao,
    pub resultado_saude: Avaliacao,
    pub resultado_atendimento: Avaliacao,
}

fn caso_hipotetico(
    dado_sensivel_lgpd: bool,
    base_legal_definida: bool,
    dpa_assinado: bool,
) -> Caso {
    Caso {
        id: String::new(),
        nome: String::new(),
        tarefa: String::new(),
        scores: Scores {
            p1: 0.9,
            p2: 0.9,
            p3: 0.9,
            p4: 0.9,
        },
        governanca: Governanca {
            dado_sensivel_lgpd,
            base_legal_definida,
            base_legal_descricao: String::new(),
            dpa_assinado,
        },
        financeiro: None,
    }
}

fn gerador_deterministico(semente: u64) -> impl FnMut() -> f64 {
    let mut estado = semente;
    move || {
        estado = (estado * 1103515245 + 12345) % 2147483648;
        estado as f64 / 2147483648.0
    }
}

fn financeiro_de(caso: &Caso) -> &Financeiro {
    caso.financeiro
        .as_ref()
        .unwrap_or_else(|| panic!("caso {} sem bloco financeiro", caso.id))
}

pub fn rodar_testes(config: &Configuracao, placar: &mut Placar) -> Result<ResultadoTestes, String> {
    let pesos_ahp = derivar_pesos_ahp(&config.ahp.matriz);
    let consistencia_ahp = calcular_consistencia_ahp(&config.ahp.matriz, &pesos_ahp);
    let limiar_verde = config.limiar_verde;
    let casos = &config.casos;
    let mut rng = gerador_padrao();

    println!("== Testes: AHP (pesos derivados + consistência) ==");
    placar.testar("os pesos AHP somam 1.0", || {
        let soma: f64 = pesos_ahp.iter().sum();
        garantir((soma - 1.0).abs() < 1e-9, || format!("soma = {soma}"))
    });
    placar.testar(
        "pergunta 3 (dado suficiente) recebe o maior peso AHP",
        || {
            let maior = pesos_ahp.iter().copied().fold(f64::MIN, f64::max);
            garantir(pesos_ahp[INDICE_P3] == maior, || {
                format!("{} != {maior}", pesos_ahp[INDICE_P3])
            })
        },
    );
    placar.testar(
        "a matriz de comparação é consistente (CR < 0.10, padrão de Saaty)",
        || {
            garantir(consistencia_ahp.consistente, || {
                format!("CR = {}, esperado < 0.10", consistencia_ahp.cr)
            })
        },
    );

    println!();
    println!("== Testes: governança (bloqueia antes do AHP, não é compensável por score) ==");
    placar.testar(
        "caso sem base legal é bloqueado, mesmo com scores perfeitos",
        || {
            let resultado = avaliar_caso_completo(
                &caso_hipotetico(false, false, true),
                &pesos_ahp,
                limiar_verde,
            );
            garantir(
                matches!(resultado, ResultadoCompleto::BloqueadoPorGovernanca { .. }),
                || "não deveria nem calcular AHP pra um caso bloqueado".to_string(),
            )
        },
    );
    placar.testar(
        "dado sensível sem DPA é bloqueado, mesmo com scores perfeitos",
        || {
            let resultado = avaliar_caso_completo(
                &caso_hipotetico(true, true, false),
                &pesos_ahp,
                limiar_verde,
            );
            let cita_dpa = matches!(
                &resultado,
                ResultadoCompleto::BloqueadoPorGovernanca { motivos } if motivos[0].contains("DPA")
            );
            garantir(cita_dpa, || "o bloqueio deveria citar o DPA".to_string())
        },
    );
    placar.testar(
        "dado sensível COM DPA passa a governança normalmente",
        || {
            let resultado =
                avaliar_caso_completo(&caso_hipotetico(true, true, true), &pesos_ahp, limiar_verde);
            garantir(resultado.aprovado(), || {
                "deveria passar a governança e o gate".to_string()
            })
        },
    );
    placar.testar(
        "os 3 casos reais da Amplitude Seguros passam na governança (nenhum deveria bloquear)",
        || {
            casos.iter().try_for_each(|caso| {
                let governanca = validar_governanca_dado(&caso.governanca);
                garantir(governanca.aprovado, || {
                    format!(
                        "{} deveria passar: {}",
                        caso.nome,
                        governanca.motivos.join("; ")
                    )
                })
            })
        },
    );
    placar.testar(
        "Amplitude Saúde Empresarial é o único caso onde o DPA realmente é exigido (dado sensível)",
        || {
            casos.iter().try_for_each(|caso| {
                let esperado = caso.id == "amplitude-saude-empresarial";
                garantir(caso.governanca.dado_sensivel_lgpd == esperado, || {
                    format!("{}: dadoSensivelLGPD deveria ser {esperado}", caso.id)
                })
            })
        },
    );

    println!();
    println!(
        "== Testes: risco operacional de provedor (checklist qualitativo, sem score fabricado) =="
    );
    placar.testar(
        "lista tem os 2 provedores reais verificados nesta disciplina, com fonte cada um",
        || {
            let riscos = listar_riscos_operacionais_provedor();
            garantir(riscos.len() == 2, || format!("{} provedores", riscos.len()))?;
            riscos.iter().try_for_each(|risco| {
                garantir(
                    !risco.fonte.is_empty() && ["Descontinuando", "Morto"].contains(&risco.status),
                    || format!("{} sem fonte ou com status inválido", risco.provedor),
                )
            })
        },
    );

    println!();
    println!("== Testes: gate reprova sozinho, não importa a média ==");
    let scores = |p1: f64, p3: f64| Scores {
        p1,
        p2: 0.9,
        p3,
        p4: 0.9,
    };
    placar.testar("score exatamente no limiar conta como sinal verde", || {
        let resultado = avaliar_framework(&scores(limiar_verde, 0.9), &pesos_ahp, limiar_verde);
        garantir(
            resultado.sinais_por_pergunta[0].1 == Sinal::Verde && resultado.aprovado,
            || "o limiar deveria contar como verde".to_string(),
        )
    });
    placar.testar(
        "as 4 com score alto -> aprovado, sem pergunta falha",
        || {
            let resultado = avaliar_framework(&scores(0.9, 0.9), &pesos_ahp, limiar_verde);
            garantir(
                resultado.aprovado && resultado.perguntas_falhas.is_empty(),
                || format!("perguntas falhas: {:?}", resultado.perguntas_falhas),
            )
        },
    );
    placar.testar(
        "aprovado no gate deixa a escolha de técnica (LoRA/full/API) em aberto -- não é a mesma decisão",
        || {
            let aprovado = avaliar_framework(&scores(0.9, 0.9), &pesos_ahp, limiar_verde);
            let reprovado = avaliar_framework(&scores(0.2, 0.9), &pesos_ahp, limiar_verde);
            garantir(
                aprovado.decisao_tecnica_em_aberto && !reprovado.decisao_tecnica_em_aberto,
                || "sem aprovação, não existe decisão de técnica a abrir".to_string(),
            )
        },
    );
    placar.testar(
        "pergunta 3 abaixo do limiar -> reprovado, falha = [3], falhaSoDado = true",
        || {
            let resultado = avaliar_framework(&scores(0.9, 0.2), &pesos_ahp, limiar_verde);
            garantir(
                !resultado.aprovado && resultado.perguntas_falhas == [3] && resultado.falha_so_dado,
                || format!("perguntas falhas: {:?}", resultado.perguntas_falhas),
            )
        },
    );
    placar.testar(
        "pergunta 1 abaixo do limiar -> reprovado, falhaSoDado = false (não é caso de esperar)",
        || {
            let resultado = avaliar_framework(&scores(0.2, 0.9), &pesos_ahp, limiar_verde);
            garantir(!resultado.falha_so_dado, || {
                "falhaSoDado deveria ser false".to_string()
            })
        },
    );

    println!();
    println!("== Testes: NPV/DCF (caso determinístico, sem crescimento) ==");
    let params_sem_crescimento = ParamsNpv {
        volume_inicial_mensal: 1000.0,
        crescimento_mensal: 0.0,
        custo_por_chamada_status_quo: 0.05,
        custo_por_chamada_fine_tuned: 0.02,
        custo_treinamento: 1000.0,
        horizonte_meses: 12,
        taxa_desconto_mensal: 0.01,
        atraso_meses: 0,
    };
    placar.testar(
        "NPV sem crescimento bate com fórmula fechada de anuidade (PV = C x [1-(1+r)^-T]/r)",
        || {
            let npv = calcular_npv(&params_sem_crescimento).npv;
            let pv_anuidade = 1000.0 * (0.05 - 0.02) * (1.0 - 1.01f64.powi(-12)) / 0.01;
            let npv_esperado = -1000.0 + pv_anuidade;
            garantir((npv - npv_esperado).abs() < 0.5, || {
                format!("npv={npv}, esperado ~{npv_esperado:.2}")
            })
        },
    );
    placar.testar("NPV com atraso não gera economia durante os meses de espera", || {
        let npv = calcular_npv(&ParamsNpv {
            custo_treinamento: 0.0,
            horizonte_meses: 3,
            taxa_desconto_mensal: 0.0,
            atraso_meses: 3,
            ..params_sem_crescimento
        })
        .npv;
        garantir(npv == 0.0, || {
            format!("npv={npv}: sem custo de treino e todo o horizonte em atraso, NPV deve ficar zerado")
        })
    });

    let caso_auto = config.caso("amplitude-auto");
    let caso_saude = config.caso("amplitude-saude-empresarial");
    let caso_atendimento = config.caso("amplitude-atendimento-cliente");

    println!();
    println!("== Testes: Monte Carlo (sanidade estatística, RNG semeado) ==");
    placar.testar(
        "amostragem triangular determinística converge pra média teórica (min+moda+max)/3",
        || {
            let mut deterministico = gerador_deterministico(42);
            let soma: f64 = (0..20000)
                .map(|_| amostrar_triangular(0.01, 0.03, 0.05, &mut deterministico))
                .sum();
            let media = soma / 20000.0;
            let media_teorica = (0.01 + 0.03 + 0.05) / 3.0;
            garantir((media - media_teorica).abs() < 0.002, || {
                format!("média amostrada={media}, teórica={media_teorica}")
            })
        },
    );
    placar.testar(
        "Monte Carlo do caso Auto (financeiro forte) dá probabilidade alta de NPV positivo",
        || {
            let mc = simular_monte_carlo(financeiro_de(caso_auto), 2000, &mut rng);
            garantir(mc.probabilidade_positivo > 0.9, || {
                format!(
                    "probabilidade={}, esperado > 0.9",
                    mc.probabilidade_positivo
                )
            })
        },
    );

    println!();
    println!("== Testes: Real Options (árvore binomial do valor de esperar) ==");
    placar.testar(
        "esperar tem valor positivo quando o custo de erro por dado insuficiente é alto",
        || {
            let opcao = precificar_opcao_de_esperar(
                financeiro_de(caso_saude),
                caso_saude.scores.p3,
                2000,
                &mut rng,
            );
            garantir(
                opcao.meses_para_esperar > 0
                    && opcao.recomendacao == RECOMENDACAO_ESPERAR
                    && opcao.valor_de_esperar > 0.0,
                || format!("valorDeEsperar={}, esperado > 0", opcao.valor_de_esperar),
            )
        },
    );
    placar.testar(
        "a volatilidade derivada do Monte Carlo é positiva e os fatores u/d são consistentes (u = 1/d)",
        || {
            let opcao =
                precificar_opcao_de_esperar(financeiro_de(caso_saude), caso_saude.scores.p3, 2000, &mut rng);
            garantir(opcao.sigma > 0.0, || format!("sigma={}, esperado > 0", opcao.sigma))?;
            garantir((opcao.u * opcao.d - 1.0).abs() < 1e-3, || {
                format!("u*d deveria ser ~1 (CRR recombinante), deu {}", opcao.u * opcao.d)
            })?;
            garantir(
                opcao.probabilidade_risco_neutra > 0.0 && opcao.probabilidade_risco_neutra < 1.0,
                || format!("p={}, esperado em (0,1)", opcao.probabilidade_risco_neutra),
            )
        },
    );
    placar.testar(
        "\"esperar\" vem com o compromisso de reavaliação agendada, não é ponto final",
        || {
            let opcao = precificar_opcao_de_esperar(
                financeiro_de(caso_saude),
                caso_saude.scores.p3,
                2000,
                &mut rng,
            );
            garantir(opcao.reavaliacao_agendada_em == "Módulo 3.2", || {
                opcao.reavaliacao_agendada_em.to_string()
            })
        },
    );

    println!();
    println!("== Testes: Sensibilidade ==");
    placar.testar(
        "análise de sensibilidade retorna os 4 parâmetros ranqueados por amplitude decrescente",
        || {
            let sensibilidade = analisar_sensibilidade(financeiro_de(caso_auto), 0.2);
            garantir(sensibilidade.len() == 4, || {
                format!("{} parâmetros", sensibilidade.len())
            })?;
            garantir(
                sensibilidade
                    .windows(2)
                    .all(|par| par[0].amplitude >= par[1].amplitude),
                || "lista deveria estar ordenada decrescente".to_string(),
            )
        },
    );

    println!();
    println!("== Testes: aplicação aos três casos reais da Amplitude Seguros ==");
    let resultado_auto = avaliar_framework(&caso_auto.scores, &pesos_ahp, limiar_verde);
    let resultado_saude = avaliar_framework(&caso_saude.scores, &pesos_ahp, limiar_verde);
    let resultado_atendimento =
        avaliar_framework(&caso_atendimento.scores, &pesos_ahp, limiar_verde);
    placar.testar("Amplitude Auto -> aprovado no gate", || {
        garantir(resultado_auto.aprovado, || {
            "deveria ser aprovado".to_string()
        })
    });
    placar.testar(
        "Amplitude Saúde Empresarial -> reprovado só por dado (elegível a Real Options)",
        || {
            garantir(
                !resultado_saude.aprovado && resultado_saude.falha_so_dado,
                || format!("perguntas falhas: {:?}", resultado_saude.perguntas_falhas),
            )
        },
    );
    placar.testar(
        "Amplitude Atendimento ao Cliente -> reprovado em p1 e p4, com p2 e p3 fortes (não elegível a Real Options)",
        || {
            garantir(
                !resultado_atendimento.aprovado
                    && resultado_atendimento.perguntas_falhas == [1, 4]
                    && !resultado_atendimento.falha_so_dado
                    && resultado_atendimento.sinais_por_pergunta[INDICE_P3].1 == Sinal::Verde
                    && resultado_atendimento.recomendacao == RECOMENDACAO_CONTINUAR_PROMPT_RAG,
                || format!("perguntas falhas: {:?}", resultado_atendimento.perguntas_falhas),
            )
        },
    );

    println!();
    println!("{}", placar.resumo("Total"));

    if placar.falhas > 0 {
        return Err(format!(
            "{} teste(s) falharam. A implementação não bate com a especificação.",
            placar.falhas
        ));
    }

    Ok(ResultadoTestes {
        pesos_ahp,
        consistencia_ahp,
        resultado_auto,
        resultado_saude,
        resultado_atendimento,
    })
}

fn imprimir_perguntas(caso: &Caso, resultado: &Avaliacao) {
    println!("\n===== {} =====", caso.nome);
    println!("Tarefa: {}\n", caso.tarefa);
    let governanca = validar_governanca_dado(&caso.governanca);
    let detalhe = if caso.governanca.dado_sensivel_lgpd {
        "dado de categoria sensível (LGPD Art. 5º, II) -- DPA verificado."
    } else {
        "dado pessoal comum, não sensível."
    };
    let status = if governanca.aprovado {
        "APROVADO"
    } else {
        "BLOQUEADO"
    };
    println!(
        "  [Governança] {status} -- {detalhe} Base legal: {}",
        caso.governanca.base_legal_descricao
    );
    for (indice, (score, sinal)) in resultado.sinais_por_pergunta.iter().enumerate() {
        println!(
            "  Pergunta {} [{}, score {score:.2}]: {}",
            indice + 1,
            sinal.rotulo(),
            PERGUNTAS[indice]
        );
    }
    println!("\n  Score composto (AHP): {:.2}", resultado.score_composto);
}

fn imprimir_caso_aprovado(caso: &Caso, resultado: &Avaliacao, rng: &mut dyn FnMut() -> f64) {
    let financeiro = financeiro_de(caso);
    imprimir_perguntas(caso, resultado);
    println!("  Recomendação (gate): {}", resultado.recomendacao);
    println!("  Decisão de técnica (LoRA local, full fine-tuning, ou API gerenciada): EM ABERTO -- Módulos 3 e 4\n");

    let npv = calcular_npv(&params_deterministicos(financeiro));
    println!("  --- Análise financeira (DCF) ---");
    println!("  Custo de treino: R$ {:.2}", financeiro.custo_treinamento);
    println!(
        "  NPV em {} meses (cenário mais provável): R$ {:.2}",
        financeiro.horizonte_meses, npv.npv
    );
    match npv.mes_breakeven {
        Some(mes) => println!("  Breakeven: mês {mes}"),
        None => println!("  Breakeven: não atinge no horizonte"),
    }

    let mc = simular_monte_carlo(financeiro, 10000, rng);
    println!("\n  --- Monte Carlo (10.000 simulações, incerteza de crescimento e custo) ---");
    println!(
        "  NPV médio: R$ {:.2} | P5: R$ {:.2} | P50: R$ {:.2} | P95: R$ {:.2}",
        mc.media, mc.p5, mc.p50, mc.p95
    );
    println!(
        "  Probabilidade de NPV positivo: {:.1}%",
        mc.probabilidade_positivo * 100.0
    );

    println!("\n  --- Sensibilidade (ranking por impacto no NPV, +/-20%) ---");
    for (posicao, item) in analisar_sensibilidade(financeiro, 0.2).iter().enumerate() {
        println!(
            "  {}. {}: amplitude de R$ {:.2}",
            posicao + 1,
            item.parametro,
            item.amplitude
        );
    }
}

fn imprimir_caso_reprovado_por_dado(
    caso: &Caso,
    resultado: &Avaliacao,
    rng: &mut dyn FnMut() -> f64,
) {
    imprimir_perguntas(caso, resultado);
    let falhas: Vec<String> = resultado
        .perguntas_falhas
        .iter()
        .map(usize::to_string)
        .collect();
    println!(
        "  Pergunta que reprovou no gate: {} (dado suficiente)",
        falhas.join(", ")
    );
    println!("  Isso é um \"ainda não\", não um \"não\" -- elegível a análise de Real Options.\n");

    let opcao = precificar_opcao_de_esperar(financeiro_de(caso), caso.scores.p3, 10000, rng);
    println!("  --- Real Options: árvore binomial, decidir agora vs. esperar ---");
    println!(
        "  Meses até o score de dado cruzar o limiar: {}",
        opcao.meses_para_esperar
    );
    println!(
        "  Volatilidade mensal (derivada do Monte Carlo, 10.000 simulações): {:.2}%",
        opcao.sigma * 100.0
    );
    println!(
        "  Fatores da árvore CRR: alta u={} | baixa d={} | prob. risco-neutra p={}",
        opcao.u, opcao.d, opcao.probabilidade_risco_neutra
    );
    println!(
        "  Valor do ativo hoje (fluxos brutos, cenário mais provável): R$ {:.2}",
        opcao.valor_presente_fluxos_brutos
    );
    println!(
        "  Valor de exercer agora (com risco de retrabalho por dado insuficiente): R$ {:.2}",
        opcao.valor_exercer_agora
    );
    println!(
        "  Valor da opção de esperar (indução retroativa na árvore): R$ {:.2}",
        opcao.valor_opcao_esperar
    );
    println!(
        "  Valor de esperar (diferença): R$ {:.2}",
        opcao.valor_de_esperar
    );
    println!("  Recomendação: {}", opcao.recomendacao);
    println!(
        "  Reavaliação agendada em: {} (roda este mesmo código de verdade, não é spoiler do resultado)",
        opcao.reavaliacao_agendada_em
    );
}

fn imprimir_caso_reprovado_geral(caso: &Caso, resultado: &Avaliacao) {
    imprimir_perguntas(caso, resultado);
    let falhas: Vec<String> = resultado
        .perguntas_falhas
        .iter()
        .map(usize::to_string)
        .collect();
    println!("  Perguntas que reprovaram no gate: {}", falhas.join(" e "));
    println!(
        "  Reparem: a pergunta 3 (dado suficiente) está VERDE, com folga. Não é falta de dado."
    );
    println!("  Não é \"falha só por dado\" -- não é elegível a Real Options. Esperar não resolve nada aqui,");
    println!("  porque o que falta não é tempo, é a tarefa ter formato fixo e não mudar de regra toda hora.");
    println!("  Recomendação: {}", resultado.recomendacao);
}

fn texto_pesos(pesos: &[f64]) -> String {
    format!(
        "p1={:.3}  p2={:.3}  p3={:.3}  p4={:.3}",
        pesos[0], pesos[1], pesos[2], pesos[3]
    )
}

fn texto_consistencia(consistencia: &Consistencia) -> &'static str {
    if consistencia.consistente {
        "consistente, CR < 0.10"
    } else {
        "INCONSISTENTE"
    }
}

pub fn rodar_demo(config: &Configuracao, resultado: &ResultadoTestes) {
    let mut rng = gerador_padrao();
    let consistencia = &resultado.consistencia_ahp;

    println!();
    println!(
        "===== Demo: Framework de 4 Perguntas -- versão de análise de decisão financeira ====="
    );
    println!(
        "\nPesos derivados por AHP: {}",
        texto_pesos(&resultado.pesos_ahp)
    );
    println!(
        "Consistência do julgamento: lambda_max={:.4}  CI={:.4}  CR={:.4} ({})",
        consistencia.lambda_max,
        consistencia.ci,
        consistencia.cr,
        texto_consistencia(consistencia)
    );

    imprimir_caso_aprovado(
        config.caso("amplitude-auto"),
        &resultado.resultado_auto,
        &mut rng,
    );
    imprimir_caso_reprovado_por_dado(
        config.caso("amplitude-saude-empresarial"),
        &resultado.resultado_saude,
        &mut rng,
    );
    imprimir_caso_reprovado_geral(
        config.caso("amplitude-atendimento-cliente"),
        &resultado.resultado_atendimento,
    );

    println!("\n-----------------------------------------------------------------------------");
    println!("Três casos, três respostas diferentes. Auto: sim. Saúde Empresarial: ainda não,");
    println!("só falta dado, e dado é questão de tempo. Atendimento ao Cliente: não -- mesmo com");
    println!(
        "o maior volume de todos e prompt/RAG já esgotado, a tarefa em si é aberta e instável"
    );
    println!("demais. Mais dado não resolve um problema que não é de dado.");
    println!("-----------------------------------------------------------------------------");
}

pub fn rodar_demo_extras() {
    println!("\n===== E se a governança não tivesse sido resolvida? (caso hipotético, pra provar o gate) =====");
    println!("\n===== Amplitude Saúde Empresarial, num mundo sem DPA (hipotético) =====");
    println!("Tarefa: Mesmo caso de Saúde Empresarial, mas sem o DPA assinado com o provedor de fine-tuning\n");
    let governanca = validar_governanca_dado(&caso_hipotetico(true, true, false).governanca);
    println!(
        "  [Governança] BLOQUEADO -- motivo(s): {}",
        governanca.motivos.join("; ")
    );
    println!("  Recomendação: {RECOMENDACAO_BLOQUEADO_POR_GOVERNANCA}");
    println!("  Nenhum AHP, NPV, Monte Carlo ou Real Options foi calculado -- não há score que compense isso.");
    println!(
        "\nRepare: os scores de p1-p4 nem importam aqui. O gate de governança roda ANTES do AHP,"
    );
    println!(
        "e bloqueia de graça -- sem gastar o resto do pipeline num caso que nem pode prosseguir."
    );

    println!("\n===== Risco operacional: o provedor escolhido ainda vai existir? =====");
    for risco in listar_riscos_operacionais_provedor() {
        println!("  [{}] {}", risco.status, risco.provedor);
        println!("    {}", risco.detalhe);
        println!("    Fonte: {}", risco.fonte);
    }
    println!("\nNão é um score: \"vale a pena\" também depende do provedor escolhido continuar existindo.");
    println!("Módulo 3 detalha o provedor real usado no resto desta disciplina (Vertex AI).");
}

pub fn rodar_demo_ahp_comite(config: &Configuracao, placar: &mut Placar) {
    println!("\n===== AHP de comitê: agregando o julgamento de vários avaliadores =====");

    let matriz_gestor_produto = vec![
        vec![1.0, 1.0, 1.0 / 3.0, 0.5],
        vec![1.0, 1.0, 1.0 / 3.0, 0.5],
        vec![3.0, 3.0, 1.0, 2.0],
        vec![2.0, 2.0, 0.5, 1.0],
    ];
    let avaliadores = [
        (
            "Gestor de produto (mesmo julgamento usado nos 3 casos reais)",
            matriz_gestor_produto.clone(),
        ),
        (
            "Compliance (prioriza p3 ainda mais, dado sensível pesa mais)",
            vec![
                vec![1.0, 2.0, 1.0 / 5.0, 1.0 / 3.0],
                vec![0.5, 1.0, 1.0 / 5.0, 1.0 / 3.0],
                vec![5.0, 5.0, 1.0, 3.0],
                vec![3.0, 3.0, 1.0 / 3.0, 1.0],
            ],
        ),
        (
            "Engenharia (perguntas mais equilibradas entre si)",
            vec![
                vec![1.0, 1.0, 0.5, 1.0],
                vec![1.0, 1.0, 0.5, 1.0],
                vec![2.0, 2.0, 1.0, 2.0],
                vec![1.0, 1.0, 0.5, 1.0],
            ],
        ),
    ];
    for (nome, matriz) in &avaliadores {
        println!("\n  {nome}");
        println!("    pesos: {}", texto_pesos(&derivar_pesos_ahp(matriz)));
    }

    let matrizes: Vec<Vec<Vec<f64>>> = avaliadores
        .iter()
        .map(|(_, matriz)| matriz.clone())
        .collect();
    let matriz_agregada = agregar_matrizes_comite(&matrizes);
    let pesos_comite = derivar_pesos_ahp(&matriz_agregada);
    let consistencia_comite = calcular_consistencia_ahp(&matriz_agregada, &pesos_comite);

    println!("\n  --- Agregado do comitê (média geométrica célula a célula, método AIJ) ---");
    println!("    pesos: {}", texto_pesos(&pesos_comite));
    println!(
        "    consistência: cr={:.4} ({})",
        consistencia_comite.cr,
        texto_consistencia(&consistencia_comite)
    );
    println!(
        "\n  O peso de p3 no comitê fica entre o do gestor de produto e o de compliance, puxado"
    );
    println!(
        "  pra baixo pela visão mais equilibrada da engenharia -- exatamente o que se espera de"
    );
    println!("  uma agregação: nenhum avaliador domina sozinho o resultado final.");

    println!("\n  --- Reaplicando o peso do comitê aos 3 casos reais da Amplitude Seguros ---");
    let pesos_originais_real = derivar_pesos_ahp(&config.ahp.matriz);
    let casos = [
        ("Amplitude Auto", config.caso("amplitude-auto")),
        (
            "Amplitude Saúde Empresarial",
            config.caso("amplitude-saude-empresarial"),
        ),
        (
            "Amplitude Atendimento ao Cliente",
            config.caso("amplitude-atendimento-cliente"),
        ),
    ];
    let veredito = |aprovado: bool| if aprovado { "aprovado" } else { "reprovado" };
    for (nome, caso) in &casos {
        let original = avaliar_framework(&caso.scores, &pesos_originais_real, config.limiar_verde);
        let comite = avaliar_framework(&caso.scores, &pesos_comite, config.limiar_verde);
        let marca = if original.aprovado != comite.aprovado {
            "  [VEREDITO MUDOU]"
        } else {
            ""
        };
        println!(
            "    {nome}: original {} (score {:.3}) -> comitê {} (score {:.3}){marca}",
            veredito(original.aprovado),
            original.score_composto,
            veredito(comite.aprovado),
            comite.score_composto
        );
    }
    println!(
        "\n  Os três vereditos batem com o peso de um avaliador só: a decisão é robusta a quem,"
    );
    println!(
        "  especificamente, preencheu a matriz -- não só a diferença de peso, o veredito final."
    );

    placar.testar(
        "comitê não muda o veredito de nenhum dos 3 casos reais",
        || {
            casos.iter().try_for_each(|(_, caso)| {
                let original =
                    avaliar_framework(&caso.scores, &pesos_originais_real, config.limiar_verde);
                let comite = avaliar_framework(&caso.scores, &pesos_comite, config.limiar_verde);
                garantir(original.aprovado == comite.aprovado, || {
                    format!("veredito de {} mudou entre matriz única e comitê", caso.id)
                })
            })
        },
    );

    println!("\n  --- Teste de regressão: comitê de 1 avaliador reproduz o resultado original ---");
    let pesos_solo = derivar_pesos_ahp(&agregar_matrizes_comite(std::slice::from_ref(
        &matriz_gestor_produto,
    )));
    let pesos_originais = derivar_pesos_ahp(&matriz_gestor_produto);
    placar.testar(
        "comitê de 1 avaliador reproduz exatamente os pesos do AHP de matriz única",
        || {
            pesos_solo
                .iter()
                .zip(&pesos_originais)
                .try_for_each(|(solo, original)| {
                    garantir((solo - original).abs() < 1e-9, || {
                        format!("{solo} != {original}")
                    })
                })
        },
    );
    placar.testar(
        "a matriz agregada do comitê ainda é reciprocamente válida (a[j][i] = 1/a[i][j])",
        || {
            let n = matriz_agregada.len();
            let reciproca = (0..n).all(|linha| {
                (0..n).all(|coluna| {
                    (matriz_agregada[linha][coluna] * matriz_agregada[coluna][linha] - 1.0).abs()
                        < 1e-9
                })
            });
            garantir(reciproca, || "a[i][j] * a[j][i] deveria ser 1".to_string())
        },
    );
    placar.testar("os pesos agregados do comitê somam 1.0", || {
        let soma: f64 = pesos_comite.iter().sum();
        garantir((soma - 1.0).abs() < 1e-9, || format!("soma = {soma}"))
    });
}

pub fn executar() -> i32 {
    let config = match carregar_configuracao() {
        Ok(config) => config,
        Err(erro) => {
            eprintln!("Erro: {erro}");
            return 1;
        }
    };
    let mut placar = Placar::default();
    let resultado = match rodar_testes(&config, &mut placar) {
        Ok(resultado) => resultado,
        Err(erro) => {
            eprintln!("Error: {erro}");
            return 1;
        }
    };

    rodar_demo(&config, &resultado);
    rodar_demo_ahp_comite(&config, &mut placar);
    println!();
    println!("{}", placar.resumo("Total geral"));

    0
}
