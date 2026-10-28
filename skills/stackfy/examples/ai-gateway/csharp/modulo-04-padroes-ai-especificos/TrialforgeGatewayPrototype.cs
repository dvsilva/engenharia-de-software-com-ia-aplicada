using System.Globalization;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using static System.FormattableString;

const string ModeloBarato = "gemma4:e2b";
const string ModeloCaro = "gemma4:latest";
const string ModeloEmbedding = "nomic-embed-text";
const double LimiarCache = 0.75;
const double LimiarConfianca = 0.7;
const int MaxTentativasOllama = 3;
const int TimeoutOllamaMs = 20000;
const int MaxIteracoesAgentic = 3;

var trilhaAuditoria = Path.Combine(PastaDoPrograma(), "audit-trail.jsonl");

var indices = new List<(string Nome, Clausula[] Clausulas)>
{
    ("icf",
    [
        new(
            "Assentimento de menores de idade em estudos clínicos",
            "Para participantes entre 12 e 17 anos, é necessário assentimento por escrito, além do consentimento do responsável legal (RDC ANVISA 466/2012, Art. 4º).",
            "RDC ANVISA 466/2012, Art. 4º"),
        new(
            "Direito de retirada do participante do estudo a qualquer momento",
            "O participante pode retirar seu consentimento a qualquer momento, sem necessidade de justificativa e sem prejuízo ao seu tratamento (RDC ANVISA 466/2012, Art. 5º).",
            "RDC ANVISA 466/2012, Art. 5º"),
    ]),
    ("protocolo",
    [
        new(
            "Critério de idade mínima para inclusão no estudo",
            "A idade mínima para participação no estudo é de doze anos completos na data da assinatura do assentimento, conforme a versão vigente do protocolo aprovada pelo comitê de ética.",
            "Protocolo Clínico TrialForge, critério de inclusão nº 2"),
        new(
            "Critério de exclusão por interação medicamentosa",
            "Participantes em uso concomitante de medicação com interação farmacológica documentada são excluídos do estudo, conforme a seção 4.2 do protocolo.",
            "Protocolo Clínico TrialForge, critério de exclusão nº 4"),
    ]),
    ("csr",
    [
        new(
            "Apresentação de eventos adversos no relatório final",
            "Eventos adversos devem ser apresentados por gravidade e causalidade, seguindo a estrutura de seções do guia ICH E3, sem agregação que oculte eventos individuais graves.",
            "ICH E3, seção 12"),
        new(
            "Significância estatística do desfecho primário",
            "O desfecho primário só pode ser reportado como positivo se atingir o nível de significância pré-especificado no plano de análise estatística, sem ajuste post-hoc.",
            "ICH E3, seção 11; Plano de Análise Estatística do estudo"),
    ]),
};

var indicePorIntencao = new Dictionary<string, string>
{
    ["consulta_icf"] = "icf",
    ["consulta_protocolo"] = "protocolo",
    ["sintese_csr"] = "csr",
};

var opcoesJson = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
using var http = new HttpClient { BaseAddress = new Uri(OllamaHost()), Timeout = Timeout.InfiniteTimeSpan };
var cacheSemantico = new List<EntradaCache>();
var indicesPreparados = new Dictionary<string, IndicePreparado>();
Queue<string>? filaRespostasAprovacao = null;
var proximoIdRequisicao = 1;

Console.OutputEncoding = Encoding.UTF8;

try
{
    RodarTestesPuros();
    await PrepararIndices();
    PrepararEntradaDeAprovacao();

    await ProcessarRequisicao("Quais são as regras de assentimento pra menores nesse estudo?");
    await ProcessarRequisicao("O assentimento dos menores de idade é obrigatório nesse estudo?");
    await ProcessarRequisicao("Preciso da síntese do CSR final desse estudo.");
    await ProcessarRequisicao("Qual o prazo de armazenamento das amostras biológicas coletadas nesse estudo?");
    await ProcessarRequisicao("Qual é o critério de idade mínima pra participar desse estudo?");

    VerificarTrilhaAuditoria();
}
catch (Exception erro)
{
    Console.Error.WriteLine($"[Erro não tratado] {erro.Message}");
    RegistrarAuditoria(new JsonObject { ["erro"] = erro.Message, ["status_final"] = "falha_tecnica" });
    Environment.ExitCode = 1;
}

static string PastaDoPrograma([CallerFilePath] string arquivo = "") => Path.GetDirectoryName(arquivo)!;

static string OllamaHost()
{
    var host = Environment.GetEnvironmentVariable("OLLAMA_HOST");
    if (string.IsNullOrEmpty(host)) return "http://localhost:11434";

    return host.Contains("://") ? host : $"http://{host}";
}

async Task<T> ComRetry<T>(Func<Task<T>> criarTarefa, string operacao)
{
    Exception? ultimoErro = null;

    for (var tentativa = 1; tentativa <= MaxTentativasOllama; tentativa++)
    {
        try
        {
            return await criarTarefa().WaitAsync(TimeSpan.FromMilliseconds(TimeoutOllamaMs));
        }
        catch (TimeoutException)
        {
            ultimoErro = new Exception($"{operacao}: timeout de {TimeoutOllamaMs}ms excedido — Ollama não respondeu a tempo.");
        }
        catch (Exception erro)
        {
            ultimoErro = erro;
        }

        Console.WriteLine($"[Retry] {operacao} falhou na tentativa {tentativa}/{MaxTentativasOllama}: {ultimoErro.Message}");
    }

    throw new Exception($"{operacao} falhou após {MaxTentativasOllama} tentativas: {ultimoErro!.Message}");
}

async Task<HttpResponseMessage> PostarNoOllama(string caminho, object corpo)
{
    var requisicao = new HttpRequestMessage(HttpMethod.Post, caminho) { Content = JsonContent.Create(corpo) };
    var resposta = await http.SendAsync(requisicao, HttpCompletionOption.ResponseHeadersRead);
    if (resposta.IsSuccessStatusCode) return resposta;

    var erro = JsonNode.Parse(await resposta.Content.ReadAsStringAsync())?["error"]?.GetValue<string>();
    throw new Exception(erro ?? $"Ollama respondeu {(int)resposta.StatusCode}");
}

async Task<double[]> Embedar(string texto)
{
    using var resposta = await ComRetry(
        () => PostarNoOllama("/api/embed", new { model = ModeloEmbedding, input = texto }),
        "Embedding");
    var corpo = JsonNode.Parse(await resposta.Content.ReadAsStringAsync());

    return corpo!["embeddings"]![0]!.AsArray().Select(numero => numero!.GetValue<double>()).ToArray();
}

static double SimilaridadeCosseno(double[] a, double[] b)
{
    double produto = 0, normaA = 0, normaB = 0;

    for (var i = 0; i < a.Length; i++)
    {
        produto += a[i] * b[i];
        normaA += a[i] * a[i];
        normaB += b[i] * b[i];
    }

    return produto / (Math.Sqrt(normaA) * Math.Sqrt(normaB));
}

(double Similaridade, EntradaCache? Entrada) ConsultarCache(double[] perguntaEmbedding)
{
    (double Similaridade, EntradaCache? Entrada) melhor = (0, null);

    foreach (var entrada in cacheSemantico)
    {
        var similaridade = SimilaridadeCosseno(perguntaEmbedding, entrada.Embedding);
        if (similaridade > melhor.Similaridade) melhor = (similaridade, entrada);
    }

    return melhor;
}

static string ClassificarIntencao(string pergunta)
{
    var p = pergunta.ToLowerInvariant();
    string[] sinaisCsr = ["csr", "relatório final", "síntese", "evento adverso", "desfecho"];
    string[] sinaisProtocolo = ["critério", "inclusão", "exclusão", "idade mínima", "protocolo"];

    if (sinaisCsr.Any(p.Contains)) return "sintese_csr";
    if (sinaisProtocolo.Any(p.Contains)) return "consulta_protocolo";

    return "consulta_icf";
}

static string[] Tokenizar(string texto)
{
    var semAcento = string.Concat(
        texto.ToLowerInvariant()
            .Normalize(NormalizationForm.FormD)
            .Where(caractere => CharUnicodeInfo.GetUnicodeCategory(caractere) != UnicodeCategory.NonSpacingMark));
    var semPontuacao = Regex.Replace(semAcento, @"[^\w\s]", " ", RegexOptions.ECMAScript);

    return Regex.Split(semPontuacao, @"\s+", RegexOptions.ECMAScript).Where(token => token.Length > 0).ToArray();
}

static EstatisticasBm25 ConstruirEstatisticasBm25(string[] documentos)
{
    var tokensPorDoc = documentos.Select(Tokenizar).ToArray();
    var df = new Dictionary<string, int>();

    foreach (var tokens in tokensPorDoc)
        foreach (var termo in tokens.Distinct())
            df[termo] = df.GetValueOrDefault(termo) + 1;

    return new(tokensPorDoc, documentos.Length, tokensPorDoc.Average(tokens => tokens.Length), df);
}

static double ScoreBm25(string[] queryTokens, string[] docTokens, EstatisticasBm25 estatisticas, double k1 = 1.5, double b = 0.75)
{
    var score = 0.0;

    foreach (var termo in queryTokens)
    {
        var freqNoDoc = docTokens.Count(token => token == termo);
        if (freqNoDoc == 0) continue;

        var docFreq = estatisticas.Df.GetValueOrDefault(termo);
        var idf = Math.Log((estatisticas.N - docFreq + 0.5) / (docFreq + 0.5) + 1);
        var numerador = freqNoDoc * (k1 + 1);
        var denominador = freqNoDoc + k1 * (1 - b + b * docTokens.Length / estatisticas.Avgdl);
        score += idf * (numerador / denominador);
    }

    return score;
}

static int[] OrdenarPorScore(double[] scores) =>
    Enumerable.Range(0, scores.Length).OrderByDescending(indice => scores[indice]).ToArray();

static (int Indice, double Score)[] FusaoReciprocalRank(int[] ranking1, int[] ranking2, int k = 60)
{
    var scores = new List<(int Indice, double Score)>();

    foreach (var ranking in new[] { ranking1, ranking2 })
        for (var posicao = 0; posicao < ranking.Length; posicao++)
        {
            var existente = scores.FindIndex(entrada => entrada.Indice == ranking[posicao]);
            var contribuicao = 1.0 / (k + posicao + 1);

            if (existente < 0) scores.Add((ranking[posicao], contribuicao));
            else scores[existente] = (ranking[posicao], scores[existente].Score + contribuicao);
        }

    return scores.OrderByDescending(entrada => entrada.Score).ToArray();
}

async Task PrepararIndices()
{
    var totalClausulas = indices.Sum(indice => indice.Clausulas.Length);
    Console.WriteLine(
        $"[Indexação] Pré-computando embeddings e estatísticas BM25 de {totalClausulas} cláusulas em " +
        $"{indices.Count} índices — uma vez, não a cada busca...");

    foreach (var (nome, clausulas) in indices)
    {
        var estatisticas = ConstruirEstatisticasBm25(clausulas.Select(clausula => clausula.Texto).ToArray());
        var embeddingsTema = new List<double[]>();
        var embeddingsTexto = new List<double[]>();

        foreach (var clausula in clausulas)
        {
            embeddingsTema.Add(await Embedar(clausula.Tema));
            embeddingsTexto.Add(await Embedar(clausula.Texto));
        }

        indicesPreparados[nome] = new(clausulas, estatisticas, [.. embeddingsTema], [.. embeddingsTexto]);
    }

    Console.WriteLine("[Indexação] Concluída.\n");
}

ResultadoBusca BuscarClausulaHibrida(string pergunta, double[] perguntaEmbedding, string nomeIndice, string campoEmbedding = "tema")
{
    var preparado = indicesPreparados[nomeIndice];
    var embeddingsCorpus = campoEmbedding == "tema" ? preparado.EmbeddingsTema : preparado.EmbeddingsTexto;
    var queryTokens = Tokenizar(pergunta);

    var similaridadesCosseno = embeddingsCorpus.Select(embedding => SimilaridadeCosseno(perguntaEmbedding, embedding)).ToArray();
    var rankingDenso = OrdenarPorScore(similaridadesCosseno);

    var scoresBm25 = preparado.Estatisticas.TokensPorDoc
        .Select(docTokens => ScoreBm25(queryTokens, docTokens, preparado.Estatisticas))
        .ToArray();
    var rankingEsparso = OrdenarPorScore(scoresBm25);

    var (melhorIndice, scoreRrf) = FusaoReciprocalRank(rankingDenso, rankingEsparso)[0];

    return new(nomeIndice, preparado.Clausulas[melhorIndice], similaridadesCosseno[melhorIndice], scoresBm25[melhorIndice], scoreRrf);
}

ResultadoBusca BuscarEmTodosIndices(string pergunta, double[] perguntaEmbedding)
{
    ResultadoBusca? melhor = null;

    foreach (var (nome, _) in indices)
    {
        var resultado = BuscarClausulaHibrida(pergunta, perguntaEmbedding, nome, "texto");
        if (melhor is null || resultado.SimilaridadeCosseno > melhor.SimilaridadeCosseno) melhor = resultado;
    }

    return melhor!;
}

ResultadoAgentico BuscarClausulaAgentica(string pergunta, double[] perguntaEmbedding, string nomeIndiceInicial)
{
    ResultadoBusca? melhorResultado = null;

    for (var iteracao = 1; iteracao <= MaxIteracoesAgentic; iteracao++)
    {
        var (estrategia, resultado) = iteracao switch
        {
            1 => ($"índice \"{nomeIndiceInicial}\", comparando com o tema da cláusula",
                BuscarClausulaHibrida(pergunta, perguntaEmbedding, nomeIndiceInicial, "tema")),
            2 => ($"índice \"{nomeIndiceInicial}\", ampliando pro texto completo da cláusula",
                BuscarClausulaHibrida(pergunta, perguntaEmbedding, nomeIndiceInicial, "texto")),
            _ => ("todos os índices, cruzando domínios (último recurso)", BuscarEmTodosIndices(pergunta, perguntaEmbedding)),
        };

        Console.WriteLine(Invariant(
            $"  [Agentic RAG] Iteração {iteracao}/{MaxIteracoesAgentic} — {estrategia} — confiança {resultado.SimilaridadeCosseno:0.000}"));
        if (melhorResultado is null || resultado.SimilaridadeCosseno > melhorResultado.SimilaridadeCosseno)
            melhorResultado = resultado;

        if (resultado.SimilaridadeCosseno >= LimiarConfianca) return new(melhorResultado, iteracao, false);
    }

    var melhorConfianca = Invariant($"{melhorResultado!.SimilaridadeCosseno:0.000}");
    Console.WriteLine(
        $"  [Agentic RAG] {MaxIteracoesAgentic} iterações esgotadas sem atingir o limiar — segue com o melhor " +
        $"resultado (confiança {melhorConfianca}) e deixa o Confidence Threshold decidir.");

    return new(melhorResultado, MaxIteracoesAgentic, true);
}

void RodarTestesPuros()
{
    Console.WriteLine("== Testes: ClassificarIntencao + SimilaridadeCosseno (puros, sem rede) ==");
    var passou = 0;
    var total = 0;

    (string Pergunta, string Esperado)[] casosIntencao =
    [
        ("Preciso da síntese do CSR final desse estudo.", "sintese_csr"),
        ("Quero o relatório final do estudo.", "sintese_csr"),
        ("Como os eventos adversos aparecem no relatório final?", "sintese_csr"),
        ("Qual é o critério de idade mínima pra participar desse estudo?", "consulta_protocolo"),
        ("Quais são os critérios de exclusão desse protocolo?", "consulta_protocolo"),
        ("Quais são as regras de assentimento pra menores?", "consulta_icf"),
        ("Qual o prazo de armazenamento das amostras biológicas?", "consulta_icf"),
    ];
    foreach (var (pergunta, esperado) in casosIntencao)
    {
        total++;
        var resultado = ClassificarIntencao(pergunta);
        var ok = resultado == esperado;
        Console.WriteLine($"  [{(ok ? "OK" : "FALHOU")}] ClassificarIntencao(\"{pergunta}\") -> {resultado} (esperado {esperado})");
        if (ok) passou++;
    }

    double[] vetorA = [1, 0, 0];
    double[] vetorB = [1, 0, 0];
    double[] vetorOrtogonal = [0, 1, 0];
    double[] vetorOposto = [-1, 0, 0];
    (string Nome, double[] A, double[] B, int Esperado)[] casosCosseno =
    [
        ("vetores idênticos", vetorA, vetorB, 1),
        ("vetores ortogonais", vetorA, vetorOrtogonal, 0),
        ("vetores opostos", vetorA, vetorOposto, -1),
    ];
    foreach (var (nome, a, b, esperado) in casosCosseno)
    {
        total++;
        var resultado = SimilaridadeCosseno(a, b);
        var ok = Math.Abs(resultado - esperado) < 1e-9;
        Console.WriteLine(Invariant($"  [{(ok ? "OK" : "FALHOU")}] SimilaridadeCosseno({nome}) -> {resultado:0.000} (esperado {esperado})"));
        if (ok) passou++;
    }

    Console.WriteLine("\n== Testes: ScoreBm25 + FusaoReciprocalRank (puros, sem rede) ==");

    string[] corpusTeste =
    [
        "idade mínima de doze anos para participar do estudo",
        "consentimento do responsável legal é obrigatório",
        "retirada do participante a qualquer momento sem justificativa",
    ];
    var estatisticasTeste = ConstruirEstatisticasBm25(corpusTeste);
    var queryTeste = Tokenizar("qual a idade mínima exigida");
    var scoresTeste = estatisticasTeste.TokensPorDoc.Select(docTokens => ScoreBm25(queryTeste, docTokens, estatisticasTeste)).ToArray();
    var vencedorBm25 = Array.IndexOf(scoresTeste, scoresTeste.Max());
    total++;
    var okBm25 = vencedorBm25 == 0;
    Console.WriteLine($"  [{(okBm25 ? "OK" : "FALHOU")}] ScoreBm25: doc sobre idade mínima vence a busca lexical (venceu doc {vencedorBm25})");
    if (okBm25) passou++;

    var fusaoTeste = FusaoReciprocalRank([0, 1, 2], [0, 2, 1]);
    total++;
    var okFusao = fusaoTeste[0].Indice == 0;
    Console.WriteLine($"  [{(okFusao ? "OK" : "FALHOU")}] FusaoReciprocalRank: doc no topo dos dois rankings vence a fusão (venceu doc {fusaoTeste[0].Indice})");
    if (okFusao) passou++;

    Console.WriteLine($"Total: {total} teste(s), {passou} passou(passaram), {total - passou} falhou(falharam).\n");
    if (passou != total)
        throw new Exception($"Testes puros falharam: {passou}/{total} — corrija antes de chamar o modelo.");
}

void PrepararEntradaDeAprovacao()
{
    if (!Console.IsInputRedirected) return;

    filaRespostasAprovacao = new Queue<string>(Console.In.ReadToEnd().Split('\n').Where(linha => linha.Length > 0));
}

bool PedirAprovacaoHumana(string rascunho)
{
    Console.WriteLine("\n[Approval Gate] Rascunho aguardando aprovação antes de virar oficial:");
    Console.WriteLine($"    {rascunho}");
    string resposta;

    if (filaRespostasAprovacao is null)
    {
        Console.Write("\nAprovar? (s/n) ");
        resposta = Console.ReadLine() ?? "";
    }
    else
    {
        resposta = filaRespostasAprovacao.TryDequeue(out var proxima) ? proxima : "";
        Console.WriteLine($"\nAprovar? (s/n) {resposta}");
    }

    return resposta.Trim().ToLowerInvariant() == "s";
}

void RegistrarAuditoria(JsonObject registro)
{
    var linha = new JsonObject
    {
        ["timestamp"] = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
    };
    foreach (var (chave, valor) in registro.ToList())
    {
        registro.Remove(chave);
        linha[chave] = valor;
    }

    File.AppendAllText(trilhaAuditoria, linha.ToJsonString(opcoesJson) + "\n");
}

async Task<string> GerarRespostaComStreaming(string modelo, string pergunta, Clausula clausula)
{
    var corpo = new
    {
        model = modelo,
        messages = new[]
        {
            new
            {
                role = "system",
                content = "Você redige respostas curtas e precisas sobre regras de estudos clínicos, citando a fonte regulatória fornecida.",
            },
            new
            {
                role = "user",
                content =
                    $"Pergunta: {pergunta}\n\n" +
                    $"Cláusula regulatória relevante: {clausula.Texto}\nFonte: {clausula.Fonte}\n\n" +
                    "Responda usando essa cláusula.",
            },
        },
        stream = true,
    };

    Console.Write("    ");
    using var resposta = await ComRetry(() => PostarNoOllama("/api/chat", corpo), "Geração de resposta");
    using var leitor = new StreamReader(await resposta.Content.ReadAsStreamAsync());
    var rascunho = new StringBuilder();

    while (await leitor.ReadLineAsync() is { } linha)
    {
        if (linha.Length == 0) continue;

        var conteudo = JsonNode.Parse(linha)?["message"]?["content"]?.GetValue<string>() ?? "";
        Console.Write(conteudo);
        rascunho.Append(conteudo);
    }
    Console.WriteLine();

    return rascunho.ToString();
}

async Task<string?> ProcessarRequisicao(string pergunta)
{
    var idRequisicao = $"req-{proximoIdRequisicao++}";
    Console.WriteLine($"\n[Gateway] Requisição recebida: \"{pergunta}\"");

    var intencao = ClassificarIntencao(pergunta);
    Console.WriteLine($"[Intent-Based Routing] Intenção classificada: {intencao}");

    var perguntaEmbedding = await Embedar(pergunta);

    if (intencao != "sintese_csr")
    {
        var (similaridade, entrada) = ConsultarCache(perguntaEmbedding);
        if (entrada is not null && similaridade >= LimiarCache)
        {
            Console.WriteLine(Invariant($"[Semantic Cache] HIT (similaridade {similaridade:0.000}) — resposta reaproveitada, sem chamar o modelo."));
            RegistrarAuditoria(new JsonObject
            {
                ["id_requisicao"] = idRequisicao,
                ["pergunta"] = pergunta,
                ["intencao"] = intencao,
                ["cache_hit"] = true,
                ["similaridade_cache"] = similaridade,
                ["status_final"] = "respondido_via_cache",
            });
            return entrada.Resposta;
        }
        Console.WriteLine(Invariant($"[Semantic Cache] MISS (melhor similaridade {similaridade:0.000}) — segue pro modelo."));
    }

    var modelo = intencao == "sintese_csr" ? ModeloCaro : ModeloBarato;
    Console.WriteLine($"[Model Router] Modelo escolhido: {modelo} ({(modelo == ModeloCaro ? "caro/capaz" : "barato/rápido")})");

    var indiceInicial = indicePorIntencao[intencao];
    Console.WriteLine($"[Multi-Index] Roteando pro índice \"{indiceInicial}\" (Módulo 4.1)");
    var resultadoRag = BuscarClausulaAgentica(pergunta, perguntaEmbedding, indiceInicial);
    var confianca = resultadoRag.Busca.SimilaridadeCosseno;
    var clausula = resultadoRag.Busca.Clausula;
    var scores = Invariant(
        $"cosseno {confianca:0.000}, BM25 {resultadoRag.Busca.ScoreBm25:0.000}, RRF {resultadoRag.Busca.ScoreRrf:0.0000}");
    Console.WriteLine(
        $"[RAG] Cláusula final: \"{clausula.Tema}\" — índice \"{resultadoRag.Busca.Indice}\", " +
        $"{scores}, {resultadoRag.IteracoesUsadas} iteração(ões).");

    Console.WriteLine("[Response Streaming] Gerando resposta:");
    var rascunho = await GerarRespostaComStreaming(modelo, pergunta, clausula);

    var precisaAprovacao = intencao == "sintese_csr" || confianca < LimiarConfianca;
    var aprovado = true;
    if (precisaAprovacao)
    {
        var motivo = intencao == "sintese_csr"
            ? "síntese de CSR — erro caro e irreversível, gate sempre obrigatório (Módulo 1.3)"
            : Invariant($"confiança abaixo do limiar ({confianca:0.000} < {LimiarConfianca})");
        Console.WriteLine($"[Confidence Threshold] Escalando pro Approval Gate — motivo: {motivo}");
        RegistrarAuditoria(new JsonObject
        {
            ["id_requisicao"] = idRequisicao,
            ["pergunta"] = pergunta,
            ["intencao"] = intencao,
            ["status_final"] = "aguardando_aprovacao",
            ["motivo_gate"] = motivo,
        });
        aprovado = PedirAprovacaoHumana(rascunho);
    }
    else
    {
        Console.WriteLine(Invariant($"[Confidence Threshold] Confiança {confianca:0.000} acima do limiar — segue sem Approval Gate."));
    }

    RegistrarAuditoria(new JsonObject
    {
        ["id_requisicao"] = idRequisicao,
        ["pergunta"] = pergunta,
        ["intencao"] = intencao,
        ["cache_hit"] = false,
        ["modelo_usado"] = modelo,
        ["indice_usado"] = resultadoRag.Busca.Indice,
        ["iteracoes_agentic"] = resultadoRag.IteracoesUsadas,
        ["esgotou_agentic"] = resultadoRag.EsgotouLimite,
        ["confianca_rag"] = confianca,
        ["gate_acionado"] = precisaAprovacao,
        ["aprovado"] = aprovado,
        ["status_final"] = aprovado ? "aprovado" : "rejeitado",
    });

    if (!aprovado)
    {
        Console.WriteLine("[Approval Gate] Rascunho rejeitado — não vira oficial.");
        return null;
    }

    if (intencao != "sintese_csr") cacheSemantico.Add(new(pergunta, perguntaEmbedding, rascunho));

    Console.WriteLine("[Gateway] Requisição concluída — trilha de auditoria registrada.");
    return rascunho;
}

void VerificarTrilhaAuditoria()
{
    var todasLinhas = File.ReadAllLines(trilhaAuditoria)
        .Where(linha => linha.Length > 0)
        .Select(linha => JsonNode.Parse(linha)!.AsObject())
        .ToList();
    var linhasConcluidas = todasLinhas.Where(linha => Texto(linha, "status_final") != "aguardando_aprovacao").ToList();
    var linhas = linhasConcluidas.TakeLast(5).ToList();

    Console.WriteLine(
        $"\n== Verificação: últimas 5 requisições concluídas ({linhasConcluidas.Count} concluídas, " +
        $"{todasLinhas.Count} entradas no total incluindo pendências) ==");

    JsonNode? Campo(int indice, string chave) => indice < linhas.Count ? linhas[indice][chave] : null;
    bool Booleano(int indice, string chave, bool esperado) =>
        Campo(indice, chave) is JsonValue valor && valor.TryGetValue<bool>(out var lido) && lido == esperado;
    double? Numero(int indice, string chave) =>
        Campo(indice, chave) is JsonValue valor && valor.TryGetValue<double>(out var lido) ? lido : null;

    (string Descricao, bool Ok)[] checagens =
    [
        ("pelo menos 5 requisições concluídas na trilha", linhasConcluidas.Count >= 5),
        ("ao menos 1 registro \"aguardando_aprovacao\" gravado antes de qualquer decisão",
            todasLinhas.Any(linha => Texto(linha, "status_final") == "aguardando_aprovacao")),
        ("#1 rotina: sem cache hit", Booleano(0, "cache_hit", false)),
        ("#1 rotina: confiança alta, sem Approval Gate", Booleano(0, "gate_acionado", false)),
        ("#2 paráfrase: cache HIT",
            Booleano(1, "cache_hit", true) && Texto(Campo(1, "status_final")) == "respondido_via_cache"),
        ("#3 síntese de CSR: modelo caro", Texto(Campo(2, "modelo_usado")) == ModeloCaro),
        ("#3 síntese de CSR: Approval Gate sempre acionado", Booleano(2, "gate_acionado", true)),
        ("#3 síntese de CSR: Multi-Index roteou pro índice csr", Texto(Campo(2, "indice_usado")) == "csr"),
        ("#4 tema diferente: cache miss", Booleano(3, "cache_hit", false)),
        ("#4 tema diferente: Agentic RAG esgotou as 3 iterações",
            Numero(3, "iteracoes_agentic") == MaxIteracoesAgentic && Booleano(3, "esgotou_agentic", true)),
        ("#4 tema diferente: Approval Gate por confiança baixa",
            Booleano(3, "gate_acionado", true) && Numero(3, "confianca_rag") < LimiarConfianca),
        ("#5 critério de protocolo: Multi-Index roteou pro índice protocolo", Texto(Campo(4, "indice_usado")) == "protocolo"),
        ("#5 critério de protocolo: Agentic RAG confiante já na 1ª iteração", Numero(4, "iteracoes_agentic") == 1),
        ("#5 critério de protocolo: sem Approval Gate", Booleano(4, "gate_acionado", false)),
    ];

    var passou = 0;
    foreach (var (descricao, ok) in checagens)
    {
        Console.WriteLine($"  [{(ok ? "OK" : "FALHOU")}] {descricao}");
        if (ok) passou++;
    }
    Console.WriteLine($"Total: {checagens.Length} verificação(ões), {passou} passou(passaram), {checagens.Length - passou} falhou(falharam).");

    if (passou != checagens.Length)
        throw new Exception(
            $"A trilha de auditoria não confirma os 4 caminhos esperados ({passou}/{checagens.Length}) — reveja audit-trail.jsonl.");
}

static string? Texto(JsonNode? no, string? chave = null)
{
    var alvo = chave is null ? no : no?[chave];
    return alvo is JsonValue valor && valor.TryGetValue<string>(out var texto) ? texto : null;
}

record Clausula(string Tema, string Texto, string Fonte);

record EstatisticasBm25(string[][] TokensPorDoc, int N, double Avgdl, Dictionary<string, int> Df);

record IndicePreparado(Clausula[] Clausulas, EstatisticasBm25 Estatisticas, double[][] EmbeddingsTema, double[][] EmbeddingsTexto);

record EntradaCache(string Pergunta, double[] Embedding, string Resposta);

record ResultadoBusca(string Indice, Clausula Clausula, double SimilaridadeCosseno, double ScoreBm25, double ScoreRrf);

record ResultadoAgentico(ResultadoBusca Busca, int IteracoesUsadas, bool EsgotouLimite);
