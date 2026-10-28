package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"time"

	"trialforge-single-agent/internal/jsontext"
	"trialforge-single-agent/internal/ollama"
)

const modelo = "gemma4:e2b"

func memoriaCurtoPrazo(protocolo string) []ollama.Message {
	return []ollama.Message{
		{Role: "system", Content: "Você redige seções de ICF para estudos clínicos."},
		{Role: "user", Content: "Protocolo: " + protocolo},
	}
}

type historicoUsuario struct {
	Interacoes   int      `json:"interacoes"`
	Preferencias []string `json:"preferencias"`
}

var bancoDeUsuarios = map[string]*historicoUsuario{}

func memoriaLongoPrazo(usuarioID, preferenciaNova string) historicoUsuario {
	historico, existe := bancoDeUsuarios[usuarioID]
	if !existe {
		historico = &historicoUsuario{Preferencias: []string{}}
		bancoDeUsuarios[usuarioID] = historico
	}
	historico.Interacoes++
	if preferenciaNova != "" {
		historico.Preferencias = append(historico.Preferencias, preferenciaNova)
	}

	return *historico
}

func rotulo(ok bool) string {
	if ok {
		return "OK"
	}

	return "FALHOU"
}

func testarMemoria() error {
	fmt.Println("== Testes: memória de longo prazo persiste entre chamadas ==")
	clear(bancoDeUsuarios)
	primeira := memoriaLongoPrazo("usuario-teste", "prefere respostas curtas")
	segunda := memoriaLongoPrazo("usuario-teste", "prefere tom formal")
	ok := segunda.Interacoes == 2 && len(segunda.Preferencias) == 2 && primeira.Interacoes == 1
	fmt.Printf("  [%s] duas chamadas com o mesmo usuarioID acumulam estado\n", rotulo(ok))
	if !ok {
		return errors.New("memoriaLongoPrazo não está persistindo corretamente entre chamadas")
	}
	clear(bancoDeUsuarios)
	fmt.Println()

	return nil
}

func demonstrarMemoria() {
	fmt.Println("===== 1. MEMÓRIA =====")

	contexto := memoriaCurtoPrazo("Estudo fase II, público-alvo 12-17 anos, terapia oncológica experimental.")
	fmt.Printf("[Curto prazo] Contexto construído para esta requisição: %d mensagem(ns).\n", len(contexto))
	fmt.Println("  -> O Agente ICF do TrialForge só precisa disso: cada protocolo é um caso novo,")
	fmt.Println("     memória de longo prazo aqui seria custo sem benefício (canvas do Módulo 2.1).")
	fmt.Println()

	fmt.Println("[Longo prazo] Simulando um assistente diferente, que acompanha o mesmo usuário ao longo do tempo:")
	fmt.Println("  1ª interação:", jsontext.Compact(memoriaLongoPrazo("usuario-42", "prefere respostas curtas")))
	fmt.Println("  2ª interação:", jsontext.Compact(memoriaLongoPrazo("usuario-42", "prefere tom formal")))
	fmt.Println("  -> Repare: a segunda chamada já sabe da primeira. Isso só vale a pena quando")
	fmt.Println("     a tarefa se repete com o mesmo contexto ao longo do tempo — o oposto do ICF.")
	fmt.Println()
}

type planejamento struct {
	texto     string
	duracaoMs int64
	chamadas  int
}

func conversar(ctx context.Context, mensagens ...ollama.Message) (ollama.Message, error) {
	resposta, err := ollama.Chat(ctx, ollama.ChatRequest{Model: modelo, Messages: mensagens})

	return resposta.Message, err
}

func chainOfThought(ctx context.Context, pergunta string) (planejamento, error) {
	inicio := time.Now()
	resposta, err := conversar(ctx, ollama.Message{
		Role:    "user",
		Content: "Pense passo a passo, de forma breve, antes de responder: " + pergunta,
	})
	if err != nil {
		return planejamento{}, err
	}

	return planejamento{texto: resposta.Content, duracaoMs: time.Since(inicio).Milliseconds(), chamadas: 1}, nil
}

func chainOfThoughtMaisReflexao(ctx context.Context, pergunta string) (planejamento, error) {
	inicio := time.Now()
	pedido := ollama.Message{Role: "user", Content: pergunta}
	primeira, err := conversar(ctx, pedido)
	if err != nil {
		return planejamento{}, err
	}

	critica, err := conversar(ctx,
		pedido,
		ollama.Message{Role: "assistant", Content: primeira.Content},
		ollama.Message{
			Role:    "user",
			Content: `Releia sua resposta acima. Ela tem algum erro ou imprecisão? Responda só "sim" ou "não" e, se sim, qual.`,
		},
	)
	if err != nil {
		return planejamento{}, err
	}

	return planejamento{texto: critica.Content, duracaoMs: time.Since(inicio).Milliseconds(), chamadas: 2}, nil
}

func demonstrarPlanejamento(ctx context.Context) error {
	fmt.Println("===== 2. PLANEJAMENTO =====")
	pergunta := "Um estudo com público-alvo de 12 a 17 anos precisa de assentimento do participante, além do consentimento do responsável?"

	cot, err := chainOfThought(ctx, pergunta)
	if err != nil {
		return err
	}
	fmt.Printf("[Chain-of-thought] %d chamada ao modelo, %dms.\n", cot.chamadas, cot.duracaoMs)

	reflexao, err := chainOfThoughtMaisReflexao(ctx, pergunta)
	if err != nil {
		return err
	}
	fmt.Printf("[+ Reflexão]        %d chamadas ao modelo, %dms.\n", reflexao.chamadas, reflexao.duracaoMs)

	razao := float64(reflexao.duracaoMs) / float64(cot.duracaoMs)
	fmt.Printf("  -> Reflexão levou %.1fx mais tempo que chain-of-thought sozinho,\n", razao)
	fmt.Println("     porque é uma chamada inteira a mais, não só um raciocínio mais longo na mesma chamada.")
	fmt.Println("     Essa é a distinção de custo que o canvas do Módulo 2.1 registra.")
	fmt.Println()

	return nil
}

type clausulaAssentimento struct {
	Texto *string `json:"texto"`
	Fonte string  `json:"fonte,omitempty"`
	Aviso string  `json:"aviso,omitempty"`
}

func buscarClausulaAssentimento(faixaEtaria []int) clausulaAssentimento {
	cobreMenor := slices.ContainsFunc(faixaEtaria, func(idade int) bool { return idade < 18 })
	if !cobreMenor {
		return clausulaAssentimento{Aviso: "população adulta: cláusula de assentimento não se aplica"}
	}

	texto := "Para participantes entre 12 e 17 anos, é necessário assentimento por escrito, além do " +
		"consentimento do responsável legal (RDC ANVISA 466/2012, Art. 4º)."
	return clausulaAssentimento{Texto: &texto, Fonte: "RDC ANVISA 466/2012, Art. 4º"}
}

func testarFerramenta() error {
	fmt.Println("== Testes: buscarClausulaAssentimento (determinístico) ==")
	okMenor := buscarClausulaAssentimento([]int{12, 15, 17}).Texto != nil
	okAdulto := buscarClausulaAssentimento([]int{25, 40, 55}).Texto == nil
	fmt.Printf("  [%s] faixa com menor de idade encontra cláusula\n", rotulo(okMenor))
	fmt.Printf("  [%s] faixa só de adultos não encontra cláusula\n", rotulo(okAdulto))
	if !okMenor || !okAdulto {
		return errors.New("buscarClausulaAssentimento não está classificando corretamente")
	}
	fmt.Println()

	return nil
}

func demonstrarFerramentas() {
	fmt.Println("===== 3. FERRAMENTAS =====")
	fmt.Println("[Caso 1] Estudo com participantes de 12 a 17 anos:")
	fmt.Println("  ", jsontext.Compact(buscarClausulaAssentimento([]int{12, 15, 17})))
	fmt.Println("[Caso 2] Estudo só com adultos:")
	fmt.Println("  ", jsontext.Compact(buscarClausulaAssentimento([]int{25, 40, 55})))
	fmt.Println(`  -> O agente não "sabe" essa regra de cor: ele delega pra uma função`)
	fmt.Println("     determinística, porque é isso que sistemas determinísticos fazem melhor.")
	fmt.Println()
}

type acaoProposta struct {
	tipo            string
	requerAprovacao bool
	executar        func() string
}

type resultadoAcao struct {
	Status    string `json:"status"`
	Mensagem  string `json:"mensagem,omitempty"`
	Resultado string `json:"resultado,omitempty"`
}

func executarOuGatear(acao acaoProposta) resultadoAcao {
	if acao.requerAprovacao {
		return resultadoAcao{
			Status: "aguardando_aprovacao",
			Mensagem: fmt.Sprintf(`Ação "%s" NÃO executada. Aguardando Approval Gate `, acao.tipo) +
				"(Módulo 1.3, Pergunta 2: erro caro e irreversível).",
		}
	}

	return resultadoAcao{Status: "executada", Resultado: acao.executar()}
}

func testarGate() error {
	fmt.Println("== Testes: executarOuGatear ==")
	semGate := executarOuGatear(acaoProposta{tipo: "x", executar: func() string { return "feito" }})
	executouComGate := false
	comGate := executarOuGatear(acaoProposta{tipo: "y", requerAprovacao: true, executar: func() string {
		executouComGate = true
		return "nunca deveria rodar"
	}})
	okSemGate := semGate.Status == "executada" && semGate.Resultado == "feito"
	okComGate := comGate.Status == "aguardando_aprovacao" && comGate.Resultado == "" && !executouComGate
	fmt.Printf("  [%s] ação sem gate executa direto\n", rotulo(okSemGate))
	fmt.Printf("  [%s] ação com gate nunca chega a executar\n", rotulo(okComGate))
	if !okSemGate || !okComGate {
		return errors.New("executarOuGatear não está bloqueando/liberando corretamente")
	}
	fmt.Println()

	return nil
}

func demonstrarAcaoEGate() {
	fmt.Println("===== 4 e 5. AÇÃO + APPROVAL GATE =====")

	gerarRascunho := acaoProposta{
		tipo:     "gerar_rascunho_icf",
		executar: func() string { return "Rascunho da seção de assentimento gerado." },
	}
	fmt.Println("[Ação 1: gerar rascunho]      ", jsontext.Compact(executarOuGatear(gerarRascunho)))

	notificarEventoAdverso := acaoProposta{
		tipo:            "notificar_evento_adverso_regulatorio",
		requerAprovacao: true,
		executar:        func() string { return "Notificação enviada à ANVISA." },
	}
	fmt.Println("[Ação 2: notificar evento adverso]", jsontext.Compact(executarOuGatear(notificarEventoAdverso)))

	fmt.Println(`  -> Mesma "capacidade de ação" nos dois casos. A diferença que decide se`)
	fmt.Println("     executa direto ou pausa pro Approval Gate não é técnica, é a Pergunta 2")
	fmt.Println("     do Módulo 1.3: o erro é caro E irreversível?")
	fmt.Println()
}

func rodarTestes() error {
	for _, teste := range []func() error{testarMemoria, testarFerramenta, testarGate} {
		if err := teste(); err != nil {
			return err
		}
	}

	return nil
}

func rodar(ctx context.Context) error {
	if err := rodarTestes(); err != nil {
		return err
	}
	demonstrarMemoria()
	if err := demonstrarPlanejamento(ctx); err != nil {
		return err
	}
	demonstrarFerramentas()
	demonstrarAcaoEGate()

	return nil
}

func main() {
	if err := rodar(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "[Erro não tratado]", err)
	}
}
