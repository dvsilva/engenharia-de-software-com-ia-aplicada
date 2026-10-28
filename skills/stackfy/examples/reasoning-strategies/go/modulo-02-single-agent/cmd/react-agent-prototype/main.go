package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"syscall"
	"time"

	"trialforge-single-agent/internal/jsontext"
	"trialforge-single-agent/internal/ollama"
)

const (
	maxIteracoes   = 4
	modelo         = "gemma4:e2b"
	nomeFerramenta = "buscar_clausula_regulatoria"
	clausula       = "Para participantes entre 12 e 17 anos, é necessário assentimento por escrito, além do consentimento do responsável legal (RDC ANVISA 466/2012, Art. 4º)."
	fonteClausula  = "RDC ANVISA 466/2012, Art. 4º"
)

var buscarClausulaRegulatoria = ollama.Tool{
	Type: "function",
	Function: ollama.FunctionDefinition{
		Name:        nomeFerramenta,
		Description: "Busca cláusulas regulatórias de estudos clínicos por tema e jurisdição. Use quando precisar de texto normativo (ANVISA ou FDA) para compor uma seção do documento.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"tema":       map[string]any{"type": "string"},
				"jurisdicao": map[string]any{"type": "string", "enum": []string{"ANVISA", "FDA"}},
			},
			"required": []string{"tema", "jurisdicao"},
		},
	},
}

type observacao struct {
	Texto *string `json:"texto"`
	Fonte *string `json:"fonte"`
	Aviso string  `json:"aviso,omitempty"`
}

func executarBuscaClausula(argumentosBrutos json.RawMessage) observacao {
	var argumentos map[string]any
	_ = json.Unmarshal(argumentosBrutos, &argumentos)

	tema, temaValido := argumentos["tema"].(string)
	jurisdicao, jurisdicaoValida := argumentos["jurisdicao"].(string)
	if !temaValido || !jurisdicaoValida {
		return observacao{
			Aviso: "parâmetro inválido ou ausente na chamada da ferramenta: " + jsontext.CompactRaw(argumentosBrutos),
		}
	}

	if jurisdicao == "ANVISA" && mencionaMenorDeIdade(tema) {
		texto, fonte := clausula, fonteClausula
		return observacao{Texto: &texto, Fonte: &fonte}
	}

	return observacao{
		Aviso: fmt.Sprintf(`não encontrado: nenhuma cláusula sobre "%s" na jurisdição %s. Tente outra jurisdição ou revise o tema.`, tema, jurisdicao),
	}
}

func mencionaMenorDeIdade(tema string) bool {
	temaNormalizado := strings.ToLower(tema)
	for _, palavra := range []string{"menor", "adolescente", "pediátric"} {
		if strings.Contains(temaNormalizado, palavra) {
			return true
		}
	}

	return false
}

type casoTesteFerramenta struct {
	tema        string
	jurisdicao  string
	esperaAchar bool
}

var casosTesteFerramenta = []casoTesteFerramenta{
	{"Assentimento para menores de idade em estudos clínicos", "ANVISA", true},
	{"Consentimento de adolescentes em pesquisa", "ANVISA", true},
	{"Cuidados pediátricos em ensaio clínico", "ANVISA", true},
	{"Consentimento informado de população adulta", "ANVISA", false},
	{"Assentimento para menores de idade", "FDA", false},
	{"Termo de Consentimento Livre e Esclarecido (TCLE)", "ANVISA", false},
}

func rotulo(ok bool) string {
	if ok {
		return "OK"
	}

	return "FALHOU"
}

func rodarTestesFerramenta() error {
	fmt.Println("== Testes: executarBuscaClausula (determinístico, 6 casos + 1 de parâmetro inválido) ==")
	passou := 0

	for _, caso := range casosTesteFerramenta {
		argumentos, _ := json.Marshal(map[string]string{"tema": caso.tema, "jurisdicao": caso.jurisdicao})
		achou := executarBuscaClausula(argumentos).Texto != nil
		ok := achou == caso.esperaAchar
		fmt.Printf("  [%s] tema=\"%s\", jurisdicao=%s -> achou=%t (esperado=%t)\n", rotulo(ok), caso.tema, caso.jurisdicao, achou, caso.esperaAchar)
		if ok {
			passou++
		}
	}

	casoInvalido := executarBuscaClausula(json.RawMessage(`{"tema":"x","jurisdicicao":"ANVISA"}`))
	invalidoOk := casoInvalido.Texto == nil && casoInvalido.Aviso != ""
	fmt.Printf("  [%s] parâmetro mal formado (\"jurisdicicao\") tratado como falha própria da ferramenta -> %t\n", rotulo(invalidoOk), invalidoOk)
	if invalidoOk {
		passou++
	}

	total := len(casosTesteFerramenta) + 1
	fmt.Printf("Total: %d teste(s), %d passou(passaram), %d falhou(falharam).\n\n", total, passou, total-passou)
	if passou != total {
		return fmt.Errorf("Testes da ferramenta falharam: %d/%d — corrija antes de rodar a simulação.", passou, total)
	}

	return nil
}

func ehErroTransitorio(erro error) bool {
	var respostaComErro *ollama.ResponseError
	if errors.As(erro, &respostaComErro) && respostaComErro.StatusCode == 404 {
		return false
	}
	if errors.Is(erro, syscall.ECONNREFUSED) || errors.Is(erro, syscall.ECONNRESET) || errors.Is(erro, syscall.ETIMEDOUT) {
		return true
	}
	var erroDeRede net.Error
	if errors.As(erro, &erroDeRede) && erroDeRede.Timeout() {
		return true
	}

	mensagem := strings.ToLower(erro.Error())
	return strings.Contains(mensagem, "timeout") || strings.Contains(mensagem, "fetch failed") || strings.Contains(mensagem, "econnrefused")
}

func chamarModeloComRetry(ctx context.Context, requisicao ollama.ChatRequest) (ollama.ChatResponse, error) {
	const tentativasMax = 3

	for tentativa := 1; ; tentativa++ {
		resposta, erro := ollama.Chat(ctx, requisicao)
		if erro == nil {
			return resposta, nil
		}
		if !ehErroTransitorio(erro) || tentativa == tentativasMax {
			return ollama.ChatResponse{}, erro
		}

		espera := 500 * time.Millisecond << (tentativa - 1)
		fmt.Printf("[Retry] Falha transitória na chamada ao modelo (tentativa %d/%d): %s. Tentando de novo em %dms.\n", tentativa, tentativasMax, erro, espera.Milliseconds())
		time.Sleep(espera)
	}
}

type passo struct {
	volta      int
	chamou     bool
	ferramenta string
	argumentos json.RawMessage
	observacao observacao
	duracaoMs  int64
}

type resultadoAgente struct {
	rascunho                   string
	iteracoes                  int
	escalarParaAprovacaoHumana bool
	motivo                     string
	trilha                     []passo
}

func agenteICF(ctx context.Context, protocolo string, limite int) (resultadoAgente, error) {
	historico := []ollama.Message{
		{
			Role: "system",
			Content: "Você redige seções de ICF para estudos clínicos. Sempre que precisar de uma cláusula " +
				"regulatória, chame a ferramenta em vez de perguntar ao usuário ou de escrever de memória. " +
				"Nunca peça esclarecimento ao usuário: decida os parâmetros da ferramenta a partir do " +
				"protocolo fornecido.",
		},
		{
			Role: "user",
			Content: "Protocolo do estudo: " + protocolo + "\n\n" +
				"Jurisdição regulatória deste estudo: ANVISA.\n\n" +
				"Gere a seção de assentimento do ICF (Termo de Consentimento) para este estudo, se aplicável. " +
				"Use a ferramenta disponível para buscar a cláusula regulatória correta antes de escrever o texto.",
		},
	}
	var trilha []passo

	for volta := 1; volta <= limite; volta++ {
		inicio := time.Now()
		resposta, erro := chamarModeloComRetry(ctx, ollama.ChatRequest{
			Model:    modelo,
			Messages: historico,
			Tools:    []ollama.Tool{buscarClausulaRegulatoria},
		})
		if erro != nil {
			return resultadoAgente{}, erro
		}
		duracaoMs := time.Since(inicio).Milliseconds()

		if len(resposta.Message.ToolCalls) == 0 {
			trilha = append(trilha, passo{volta: volta, duracaoMs: duracaoMs})
			return resultadoAgente{rascunho: resposta.Message.Content, iteracoes: volta, trilha: trilha}, nil
		}

		chamada := resposta.Message.ToolCalls[0].Function
		resultado := executarBuscaClausula(chamada.Arguments)
		trilha = append(trilha, passo{
			volta:      volta,
			chamou:     true,
			ferramenta: chamada.Name,
			argumentos: chamada.Arguments,
			observacao: resultado,
			duracaoMs:  duracaoMs,
		})

		historico = append(historico, resposta.Message, ollama.Message{
			Role:     "tool",
			ToolName: chamada.Name,
			Content:  jsontext.Compact(resultado),
		})
	}

	return resultadoAgente{
		escalarParaAprovacaoHumana: true,
		motivo:                     fmt.Sprintf("não convergiu em %d volta(s)", limite),
		trilha:                     trilha,
	}, nil
}

func imprimirTrilha(trilha []passo) {
	fmt.Println("  [Trilha de desenvolvimento — não é a trilha de auditoria do Módulo 5.2]")
	for _, passo := range trilha {
		if !passo.chamou {
			fmt.Printf("    volta %d (%dms): decidiu que já tinha o suficiente, respondeu\n", passo.volta, passo.duracaoMs)
			continue
		}
		fmt.Printf("    volta %d (%dms): chamou %s(%s) -> %s\n", passo.volta, passo.duracaoMs, passo.ferramenta, jsontext.CompactRaw(passo.argumentos), jsontext.Compact(passo.observacao))
	}
}

func submeter(protocolo string) {
	fmt.Println("[Mariana submete o protocolo ao Gateway]")
	fmt.Println("  ", protocolo)
	fmt.Println()
}

func simularInteracao(ctx context.Context) error {
	fmt.Println("===== Cenário 1: convergência normal (cláusula encontrada) =====")
	protocolo1 := "Estudo fase II, público-alvo entre 12 e 17 anos, terapia oncológica experimental."
	submeter(protocolo1)

	resultado1, erro := agenteICF(ctx, protocolo1, maxIteracoes)
	if erro != nil {
		return erro
	}
	fmt.Printf("[Agente ICF] Rascunho gerado após %d volta(s) de loop, rodando localmente:\n", resultado1.iteracoes)
	fmt.Println("  ", resultado1.rascunho)
	imprimirTrilha(resultado1.trilha)
	fmt.Println("[Sistema] Rascunho aguardando revisão do Approval Gate antes de virar versão oficial.")
	fmt.Println()

	fmt.Println("===== Cenário 2: ferramenta não encontra cláusula (população adulta) =====")
	protocolo2 := "Estudo fase III, população adulta (18-65 anos), diabetes tipo 2, sem envolvimento de menores de idade."
	submeter(protocolo2)

	resultado2, erro := agenteICF(ctx, protocolo2, maxIteracoes)
	if erro != nil {
		return erro
	}
	imprimirTrilha(resultado2.trilha)
	if resultado2.escalarParaAprovacaoHumana {
		fmt.Println("[Orquestrador] Loop não convergiu —", resultado2.motivo)
		fmt.Println("[Sistema] Encaminhando ao Approval Gate para intervenção manual.")
	} else {
		fmt.Printf("[Agente ICF] Respondeu após %d volta(s), sem achar cláusula específica.\n", resultado2.iteracoes)
		fmt.Println("[Atenção] Repare na trilha: mesmo sem achar a cláusula, o modelo escreveu um rascunho genérico " +
			"em vez de escalar — desviando da instrução do system prompt. É exatamente esse tipo de desvio " +
			"que a trilha existe para flagrar, e por isso o Approval Gate revisa antes de qualquer coisa virar oficial.")
	}
	fmt.Println()

	fmt.Println("===== Cenário 3: não convergência, escalonamento (limiar forçado a 1 volta pra demo confiável) =====")
	protocolo3 := "Estudo fase III, população adulta, diabetes tipo 2, sem envolvimento de menores de idade."
	submeter(protocolo3)

	resultado3, erro := agenteICF(ctx, protocolo3, 1)
	if erro != nil {
		return erro
	}
	imprimirTrilha(resultado3.trilha)
	if resultado3.escalarParaAprovacaoHumana {
		fmt.Println("[Orquestrador] Loop não convergiu —", resultado3.motivo)
		fmt.Println("[Sistema] Encaminhando ao Approval Gate para intervenção manual — nunca falha silenciosamente.")
	} else {
		fmt.Println("[Atenção] O modelo convergiu na única volta permitida antes mesmo de precisar escalar.")
	}

	return nil
}

func main() {
	ctx := context.Background()
	erro := rodarTestesFerramenta()
	if erro == nil {
		erro = simularInteracao(ctx)
	}
	if erro != nil {
		fmt.Fprintln(os.Stderr, "[Erro não tratado]", erro)
		fmt.Println("[Sistema] Encaminhando ao Approval Gate — falha técnica também é motivo de escalonamento.")
	}
}
