package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
	"sync"
	"time"
)

type estrategia int

const (
	esperarTodos estrategia = iota
	retornarNoPrimeiroErro
)

type criterios struct {
	IdadeMinima int `json:"idadeMinima"`
}

type dadoProtocolo struct {
	Versao    int       `json:"versao"`
	Criterios criterios `json:"criterios"`
	Estudo    string    `json:"estudo"`
}

type revisao struct {
	VersaoAnterior      int       `json:"versaoAnterior"`
	CriteriosAnteriores criterios `json:"criteriosAnteriores"`
	Motivo              string    `json:"motivo"`
}

type documentoICF struct {
	Agente           string    `json:"agente"`
	Secao            string    `json:"secao"`
	CriterioUsado    criterios `json:"criterioUsado"`
	VersaoUsada      int       `json:"versaoUsada"`
	VersaoAoConcluir int       `json:"versaoAoConcluir"`
	Tentativas       int       `json:"tentativas"`
}

type documentoCSR struct {
	Agente           string    `json:"agente"`
	Sintese          string    `json:"sintese"`
	CriterioUsado    criterios `json:"criterioUsado"`
	VersaoUsada      int       `json:"versaoUsada"`
	VersaoAoConcluir int       `json:"versaoAoConcluir"`
}

type verificacao struct {
	Consistente        bool     `json:"consistente"`
	ICFConsistente     bool     `json:"icfConsistente"`
	CSRConsistente     bool     `json:"csrConsistente"`
	AgentesDivergentes []string `json:"agentesDivergentes"`
}

type conclusao[T any] struct {
	valor T
	erro  error
}

type erroDeTimeout struct {
	nomeAgente string
	timeout    time.Duration
}

type estadoProtocolo struct {
	mutex     sync.Mutex
	versao    int
	criterios criterios
	historico []revisao
}

type registro struct {
	documento  documentoICF
	tentativas int
}

type documentosGerados struct {
	mutex     sync.Mutex
	registros map[string]*registro
}

type ordemDeExecucao struct {
	mutex  sync.Mutex
	etapas []string
}

type barramentoDeEventos struct {
	mutex    sync.Mutex
	ouvintes map[string]func(dadoProtocolo)
}

type falhasICF struct {
	forcarFalhaICF      bool
	forcarTravamentoICF bool
}

type opcoesFluxo struct {
	falhasICF
	estrategia            estrategia
	forcarFalhaProtocolo  bool
	persistirFalhaNoRetry bool
	comEmendaEtica        bool
}

type fluxoTrialForge struct {
	estudo     string
	opcoes     opcoesFluxo
	documentos *documentosGerados
	ordem      *ordemDeExecucao
	protocolo  *estadoProtocolo
	barramento *barramentoDeEventos
}

type reacaoParalela struct {
	ok                     bool
	resultadoICF           *documentoICF
	resultadoCSR           *documentoCSR
	erro                   string
	erroICF                string
	resultadoCSRPreservado bool
}

type resultadoRetry struct {
	sucesso          bool
	resultado        documentoICF
	erro             string
	tentativasFeitas int
}

type resultadoFluxo struct {
	dadoProtocolo     dadoProtocolo
	reacao            reacaoParalela
	decisaoSupervisor string
	documentosGerados int
	tentativasICF     int
	tentativasRetry   int
	ordemDeExecucao   []string
	historico         []revisao
	verificacao       *verificacao
}

type placar struct {
	passou int
	total  int
}

const (
	tempoProtocolo    = 300 * time.Millisecond
	tempoICF          = 450 * time.Millisecond
	tempoCSR          = 600 * time.Millisecond
	tempoEmenda       = 500 * time.Millisecond
	margemDeSeguranca = 1.5
	timeoutProtocolo  = time.Duration(margemDeSeguranca * float64(tempoProtocolo))
	timeoutICF        = time.Duration(margemDeSeguranca * float64(tempoICF))
	timeoutCSR        = time.Duration(margemDeSeguranca * float64(tempoCSR))
	tempoICFTravado   = timeoutICF * 3
	maxTentativas     = 3
)

var criteriosIniciais = criterios{IdadeMinima: 13}

func (erro erroDeTimeout) Error() string {
	return fmt.Sprintf("%s: timeout de %v excedido — agente não respondeu a tempo.", erro.nomeAgente, erro.timeout)
}

func (tarefa conclusao[T]) valorSeConcluida() *T {
	if tarefa.erro != nil {
		return nil
	}

	return &tarefa.valor
}

func mensagemDe(erro error) string {
	if erro == nil {
		return ""
	}

	return erro.Error()
}

func executar[T any](trabalho func() (T, error)) <-chan conclusao[T] {
	canal := make(chan conclusao[T], 1)

	go func() {
		valor, erro := trabalho()
		canal <- conclusao[T]{valor: valor, erro: erro}
	}()

	return canal
}

func comTimeout[T any](tarefa <-chan conclusao[T], timeout time.Duration, nomeAgente string) <-chan conclusao[T] {
	return executar(func() (T, error) {
		select {
		case concluida := <-tarefa:
			return concluida.valor, concluida.erro
		case <-time.After(timeout):
			var vazio T

			return vazio, erroDeTimeout{nomeAgente: nomeAgente, timeout: timeout}
		}
	})
}

func criarEstadoProtocolo(iniciais criterios) *estadoProtocolo {
	return &estadoProtocolo{versao: 1, criterios: iniciais, historico: []revisao{}}
}

func (estado *estadoProtocolo) revisar(novos criterios, motivo string) {
	estado.mutex.Lock()
	defer estado.mutex.Unlock()

	estado.historico = append(estado.historico, revisao{
		VersaoAnterior:      estado.versao,
		CriteriosAnteriores: estado.criterios,
		Motivo:              motivo,
	})
	estado.versao++
	estado.criterios = novos
}

func (estado *estadoProtocolo) publicar(estudo string) dadoProtocolo {
	estado.mutex.Lock()
	defer estado.mutex.Unlock()

	return dadoProtocolo{Versao: estado.versao, Criterios: estado.criterios, Estudo: estudo}
}

func (estado *estadoProtocolo) versaoAtual() int {
	estado.mutex.Lock()
	defer estado.mutex.Unlock()

	return estado.versao
}

func (estado *estadoProtocolo) revisoes() []revisao {
	estado.mutex.Lock()
	defer estado.mutex.Unlock()

	return slices.Clone(estado.historico)
}

func chaveICF(versao int) string {
	return fmt.Sprintf("%d:icf", versao)
}

func (documentos *documentosGerados) registrar(chave string, documento documentoICF) int {
	documentos.mutex.Lock()
	defer documentos.mutex.Unlock()

	existente, existe := documentos.registros[chave]
	if existe {
		existente.tentativas++

		return existente.tentativas
	}

	documentos.registros[chave] = &registro{documento: documento, tentativas: 1}

	return 1
}

func (documentos *documentosGerados) quantidade() int {
	documentos.mutex.Lock()
	defer documentos.mutex.Unlock()

	return len(documentos.registros)
}

func (documentos *documentosGerados) tentativas(chave string) int {
	documentos.mutex.Lock()
	defer documentos.mutex.Unlock()

	existente, existe := documentos.registros[chave]
	if !existe {
		return 0
	}

	return existente.tentativas
}

func (ordem *ordemDeExecucao) registrar(etapa string) {
	ordem.mutex.Lock()
	defer ordem.mutex.Unlock()

	ordem.etapas = append(ordem.etapas, etapa)
}

func (ordem *ordemDeExecucao) lista() []string {
	ordem.mutex.Lock()
	defer ordem.mutex.Unlock()

	return slices.Clone(ordem.etapas)
}

func (barramento *barramentoDeEventos) once(evento string, ouvinte func(dadoProtocolo)) {
	barramento.mutex.Lock()
	defer barramento.mutex.Unlock()

	barramento.ouvintes[evento] = ouvinte
}

func (barramento *barramentoDeEventos) emit(evento string, dado dadoProtocolo) {
	barramento.mutex.Lock()
	ouvinte, existe := barramento.ouvintes[evento]
	delete(barramento.ouvintes, evento)
	barramento.mutex.Unlock()

	if existe {
		go ouvinte(dado)
	}
}

func (fluxo *fluxoTrialForge) agenteProtocolo() <-chan conclusao[dadoProtocolo] {
	return executar(func() (dadoProtocolo, error) {
		time.Sleep(tempoProtocolo)
		if fluxo.opcoes.forcarFalhaProtocolo {
			return dadoProtocolo{}, errors.New("Agente Protocolo: falha simulada ao gerar critérios.")
		}

		fluxo.ordem.registrar("protocolo")
		dado := fluxo.protocolo.publicar(fluxo.estudo)
		fluxo.barramento.emit("protocolo:pronto", dado)
		if fluxo.opcoes.comEmendaEtica {
			time.AfterFunc(tempoEmenda, func() {
				fluxo.protocolo.revisar(criterios{IdadeMinima: 12}, "Comitê de ética corrigiu a idade mínima de 13 para 12 anos.")
			})
		}

		return dado, nil
	})
}

func (fluxo *fluxoTrialForge) agenteICF(dado dadoProtocolo, falhas falhasICF) <-chan conclusao[documentoICF] {
	fluxo.ordem.registrar("icf:inicio")

	return executar(func() (documentoICF, error) {
		duracao := tempoICF
		if falhas.forcarTravamentoICF {
			duracao = tempoICFTravado
		}

		time.Sleep(duracao)
		documento := documentoICF{
			Agente:           "ICF",
			Secao:            fmt.Sprintf("Assentimento gerado com idade mínima de %d anos (a partir da versão %d do protocolo).", dado.Criterios.IdadeMinima, dado.Versao),
			CriterioUsado:    dado.Criterios,
			VersaoUsada:      dado.Versao,
			VersaoAoConcluir: fluxo.protocolo.versaoAtual(),
		}
		documento.Tentativas = fluxo.documentos.registrar(chaveICF(dado.Versao), documento)
		if falhas.forcarFalhaICF {
			return documentoICF{}, errors.New("Agente ICF: falha simulada na confirmação, depois do documento já ter sido gravado.")
		}

		return documento, nil
	})
}

func (fluxo *fluxoTrialForge) agenteCSR(dado dadoProtocolo) <-chan conclusao[documentoCSR] {
	fluxo.ordem.registrar("csr:inicio")

	return executar(func() (documentoCSR, error) {
		time.Sleep(tempoCSR)

		return documentoCSR{
			Agente:           "CSR",
			Sintese:          fmt.Sprintf("Conformidade ICH E3 verificada com idade mínima de %d anos (a partir da versão %d do protocolo).", dado.Criterios.IdadeMinima, dado.Versao),
			CriterioUsado:    dado.Criterios,
			VersaoUsada:      dado.Versao,
			VersaoAoConcluir: fluxo.protocolo.versaoAtual(),
		}, nil
	})
}

func juntarAtePrimeiroErro(tarefaICF <-chan conclusao[documentoICF], tarefaCSR <-chan conclusao[documentoCSR]) reacaoParalela {
	var resultadoICF documentoICF
	var resultadoCSR documentoCSR

	for pendentes := 2; pendentes > 0; pendentes-- {
		select {
		case icf := <-tarefaICF:
			if icf.erro != nil {
				return reacaoParalela{erro: icf.erro.Error()}
			}

			resultadoICF = icf.valor
		case csr := <-tarefaCSR:
			if csr.erro != nil {
				return reacaoParalela{erro: csr.erro.Error()}
			}

			resultadoCSR = csr.valor
		}
	}

	return reacaoParalela{ok: true, resultadoICF: &resultadoICF, resultadoCSR: &resultadoCSR, resultadoCSRPreservado: true}
}

func juntarTodos(tarefaICF <-chan conclusao[documentoICF], tarefaCSR <-chan conclusao[documentoCSR]) reacaoParalela {
	icf := <-tarefaICF
	csr := <-tarefaCSR

	return reacaoParalela{
		ok:                     icf.erro == nil && csr.erro == nil,
		resultadoICF:           icf.valorSeConcluida(),
		resultadoCSR:           csr.valorSeConcluida(),
		erroICF:                mensagemDe(icf.erro),
		resultadoCSRPreservado: csr.erro == nil,
	}
}

func (fluxo *fluxoTrialForge) inscreverReacaoParalela() <-chan reacaoParalela {
	pronta := make(chan reacaoParalela, 1)

	fluxo.barramento.once("protocolo:pronto", func(dado dadoProtocolo) {
		tarefaICF := comTimeout(fluxo.agenteICF(dado, fluxo.opcoes.falhasICF), timeoutICF, "Agente ICF")
		tarefaCSR := comTimeout(fluxo.agenteCSR(dado), timeoutCSR, "Agente CSR")

		if fluxo.opcoes.estrategia == retornarNoPrimeiroErro {
			pronta <- juntarAtePrimeiroErro(tarefaICF, tarefaCSR)

			return
		}

		pronta <- juntarTodos(tarefaICF, tarefaCSR)
	})

	return pronta
}

func decidirEstrategiaDeRetry(reacao reacaoParalela) string {
	if reacao.ok {
		return "nenhum_retry_necessario"
	}
	if reacao.resultadoCSRPreservado {
		return "retry_icf_apenas"
	}

	return "retry_ambos"
}

func (fluxo *fluxoTrialForge) executarICFComRetry(dado dadoProtocolo) resultadoRetry {
	falhasDaTentativa := falhasICF{}
	if fluxo.opcoes.persistirFalhaNoRetry {
		falhasDaTentativa = fluxo.opcoes.falhasICF
	}

	var ultimoErro error
	for tentativa := 1; tentativa <= maxTentativas; tentativa++ {
		icf := <-comTimeout(fluxo.agenteICF(dado, falhasDaTentativa), timeoutICF, "Agente ICF")
		if icf.erro == nil {
			return resultadoRetry{sucesso: true, resultado: icf.valor, tentativasFeitas: tentativa}
		}

		ultimoErro = icf.erro
	}

	return resultadoRetry{erro: ultimoErro.Error(), tentativasFeitas: maxTentativas}
}

func aplicarRetry(reacao reacaoParalela, retry resultadoRetry) (reacaoParalela, string) {
	if !retry.sucesso {
		reacao.ok = false
		reacao.erroICF = retry.erro

		return reacao, "retry_esgotado_seguindo_sem_icf"
	}

	reacao.ok = true
	reacao.resultadoICF = &retry.resultado

	return reacao, "retry_icf_executado_com_sucesso"
}

func verificarConsistencia(icf documentoICF, csr documentoCSR) verificacao {
	icfConsistente := icf.VersaoUsada == icf.VersaoAoConcluir
	csrConsistente := csr.VersaoUsada == csr.VersaoAoConcluir
	agentesDivergentes := []string{}

	if !icfConsistente {
		agentesDivergentes = append(agentesDivergentes, "ICF")
	}
	if !csrConsistente {
		agentesDivergentes = append(agentesDivergentes, "CSR")
	}

	return verificacao{
		Consistente:        len(agentesDivergentes) == 0,
		ICFConsistente:     icfConsistente,
		CSRConsistente:     csrConsistente,
		AgentesDivergentes: agentesDivergentes,
	}
}

func (fluxo *fluxoTrialForge) compensarDivergencia(agentesDivergentes []string, reacao reacaoParalela) reacaoParalela {
	dadoAtual := fluxo.protocolo.publicar(fluxo.estudo)

	if slices.Contains(agentesDivergentes, "ICF") {
		icf := <-fluxo.agenteICF(dadoAtual, falhasICF{})
		reacao.resultadoICF = &icf.valor
	}
	if slices.Contains(agentesDivergentes, "CSR") {
		csr := <-fluxo.agenteCSR(dadoAtual)
		reacao.resultadoCSR = &csr.valor
	}

	return reacao
}

func (fluxo *fluxoTrialForge) verificarECompensar(reacao reacaoParalela, decisao string) (reacaoParalela, *verificacao, string) {
	if !reacao.ok || reacao.resultadoICF == nil || reacao.resultadoCSR == nil {
		return reacao, nil, decisao
	}

	verificado := verificarConsistencia(*reacao.resultadoICF, *reacao.resultadoCSR)
	if verificado.Consistente {
		return reacao, &verificado, decisao
	}

	compensada := fluxo.compensarDivergencia(verificado.AgentesDivergentes, reacao)

	return compensada, &verificado, "saga_compensacao_" + strings.ToLower(strings.Join(verificado.AgentesDivergentes, "_e_"))
}

func rodarFluxoTrialForge(estudo string, opcoes opcoesFluxo) (resultadoFluxo, error) {
	fluxo := &fluxoTrialForge{
		estudo:     estudo,
		opcoes:     opcoes,
		documentos: &documentosGerados{registros: map[string]*registro{}},
		ordem:      &ordemDeExecucao{},
		protocolo:  criarEstadoProtocolo(criteriosIniciais),
		barramento: &barramentoDeEventos{ouvintes: map[string]func(dadoProtocolo){}},
	}
	reacaoPendente := fluxo.inscreverReacaoParalela()
	protocolo := <-comTimeout(fluxo.agenteProtocolo(), timeoutProtocolo, "Agente Protocolo")

	if protocolo.erro != nil {
		return resultadoFluxo{}, protocolo.erro
	}

	reacao := <-reacaoPendente
	decisao := decidirEstrategiaDeRetry(reacao)
	tentativasRetry := 0

	if decisao == "retry_icf_apenas" {
		retry := fluxo.executarICFComRetry(protocolo.valor)
		tentativasRetry = retry.tentativasFeitas
		reacao, decisao = aplicarRetry(reacao, retry)
	}

	tentativasICF := fluxo.documentos.tentativas(chaveICF(protocolo.valor.Versao))
	reacao, verificado, decisao := fluxo.verificarECompensar(reacao, decisao)

	return resultadoFluxo{
		dadoProtocolo:     protocolo.valor,
		reacao:            reacao,
		decisaoSupervisor: decisao,
		documentosGerados: fluxo.documentos.quantidade(),
		tentativasICF:     tentativasICF,
		tentativasRetry:   tentativasRetry,
		ordemDeExecucao:   fluxo.ordem.lista(),
		historico:         fluxo.protocolo.revisoes(),
		verificacao:       verificado,
	}, nil
}

func emJSON(valor any) string {
	texto, erro := json.Marshal(valor)
	if erro != nil {
		return erro.Error()
	}

	return string(texto)
}

func (resultado *placar) conferir(ok bool, descricao string) {
	rotulo := "FALHOU"
	if ok {
		rotulo = "OK"
		resultado.passou++
	}

	resultado.total++
	fmt.Printf("  [%s] %s\n", rotulo, descricao)
}

func rodarTestes() error {
	fmt.Println("== Testes: trialforge-message-queue-prototype ==")
	resultado := &placar{}

	feliz, erro := rodarFluxoTrialForge("Estudo fase II", opcoesFluxo{})
	if erro != nil {
		return erro
	}

	resultado.conferir(feliz.dadoProtocolo.Versao == 1,
		"evento 'protocolo:pronto' carrega versao+criterios estruturados (evento rico)")
	resultado.conferir(feliz.reacao.ok && feliz.decisaoSupervisor == "nenhum_retry_necessario" && feliz.verificacao != nil && feliz.verificacao.Consistente,
		"caminho feliz: ICF+CSR ok, sem retry, consistência confirmada")

	bug, erro := rodarFluxoTrialForge("Estudo fase II", opcoesFluxo{
		estrategia: retornarNoPrimeiroErro,
		falhasICF:  falhasICF{forcarFalhaICF: true},
	})
	if erro != nil {
		return erro
	}

	resultado.conferir(!bug.reacao.ok && !bug.reacao.resultadoCSRPreservado,
		"Retorno no primeiro erro: falha do ICF perde o resultado do CSR (bug do parágrafo 68-71)")

	corrigido, erro := rodarFluxoTrialForge("Estudo fase II", opcoesFluxo{falhasICF: falhasICF{forcarFalhaICF: true}})
	if erro != nil {
		return erro
	}

	resultado.conferir(corrigido.reacao.resultadoCSRPreservado && corrigido.decisaoSupervisor == "retry_icf_executado_com_sucesso" && corrigido.reacao.ok,
		"Espera pelos dois canais: CSR preservado, retry do ICF executado de verdade e com sucesso")
	resultado.conferir(corrigido.documentosGerados == 1 && corrigido.tentativasICF == 2,
		"Idempotência: 1 documento só (não 2) após falha + retry, com 2 tentativas registradas")

	ordem, erro := rodarFluxoTrialForge("Estudo de ordem", opcoesFluxo{})
	if erro != nil {
		return erro
	}

	indiceProtocolo := slices.Index(ordem.ordemDeExecucao, "protocolo")
	resultado.conferir(indiceProtocolo != -1 &&
		indiceProtocolo < slices.Index(ordem.ordemDeExecucao, "icf:inicio") &&
		indiceProtocolo < slices.Index(ordem.ordemDeExecucao, "csr:inicio"),
		"Sequential respeitado (prova causal): ordem real = "+emJSON(ordem.ordemDeExecucao))

	divergencia, erro := rodarFluxoTrialForge("Estudo com emenda", opcoesFluxo{comEmendaEtica: true})
	if erro != nil {
		return erro
	}

	resultado.conferir(divergencia.verificacao != nil &&
		!divergencia.verificacao.Consistente &&
		divergencia.verificacao.ICFConsistente &&
		!divergencia.verificacao.CSRConsistente &&
		slices.Equal(divergencia.verificacao.AgentesDivergentes, []string{"CSR"}),
		"Divergência detectada: ICF consistente, CSR defasado (só ele, exatamente como o Módulo 3.2 descreve)")
	resultado.conferir(divergencia.reacao.resultadoCSR.CriterioUsado.IdadeMinima == 12 &&
		divergencia.reacao.resultadoCSR.VersaoUsada == 2 &&
		divergencia.decisaoSupervisor == "saga_compensacao_csr" &&
		len(divergencia.historico) == 1,
		"Compensação Saga: CSR regenerado com idadeMinima=12 (versão 2), histórico do protocolo preservado")

	travado, erro := rodarFluxoTrialForge("Estudo com agente travado", opcoesFluxo{falhasICF: falhasICF{forcarTravamentoICF: true}})
	if erro != nil {
		return erro
	}

	resultado.conferir(strings.Contains(travado.reacao.erroICF, "timeout") &&
		travado.decisaoSupervisor == "retry_icf_executado_com_sucesso" &&
		travado.tentativasRetry == 1,
		"Timeout real detectado (select com time.After, não exceção simulada) e recuperado no retry")

	esgotado, erro := rodarFluxoTrialForge("Estudo com falha persistente", opcoesFluxo{
		falhasICF:             falhasICF{forcarTravamentoICF: true},
		persistirFalhaNoRetry: true,
	})
	if erro != nil {
		return erro
	}

	resultado.conferir(esgotado.decisaoSupervisor == "retry_esgotado_seguindo_sem_icf" &&
		esgotado.tentativasRetry == maxTentativas &&
		!esgotado.reacao.ok,
		fmt.Sprintf("Retry com limite: esgota %d tentativas numa falha persistente, Supervisor segue sem o ICF", maxTentativas))

	fmt.Printf("Total: %d teste(s), %d passou(passaram), %d falhou(falharam).\n\n", resultado.total, resultado.passou, resultado.total-resultado.passou)
	if resultado.passou != resultado.total {
		return fmt.Errorf("Testes falharam: %d/%d — corrija antes de considerar o protótipo pronto.", resultado.passou, resultado.total)
	}

	return nil
}

func demonstrar() error {
	fmt.Println("===== TRIALFORGE: FILA DE MENSAGENS (barramento com goroutines) =====")
	fmt.Println()

	fmt.Println("[Cenário 1] Caminho feliz — Protocolo primeiro, depois ICF+CSR em paralelo:")
	feliz, erro := rodarFluxoTrialForge("Estudo fase II, 12-17 anos", opcoesFluxo{})
	if erro != nil {
		return erro
	}

	fmt.Println("  Evento protocolo:pronto:", emJSON(feliz.dadoProtocolo))
	fmt.Println("  Resultado ICF:", emJSON(feliz.reacao.resultadoICF))
	fmt.Println("  Resultado CSR:", emJSON(feliz.reacao.resultadoCSR))
	fmt.Println("  Decisão do Supervisor:", feliz.decisaoSupervisor)
	fmt.Println("  Ordem real de execução:", strings.Join(feliz.ordemDeExecucao, " -> "))
	fmt.Println()

	fmt.Println("[Cenário 2] ICF falha, usando o retorno no primeiro erro (o bug do parágrafo 68-71):")
	bug, erro := rodarFluxoTrialForge("Estudo fase II, 12-17 anos", opcoesFluxo{
		estrategia: retornarNoPrimeiroErro,
		falhasICF:  falhasICF{forcarFalhaICF: true},
	})
	if erro != nil {
		return erro
	}

	fmt.Println("  ok:", bug.reacao.ok, "| resultado do CSR preservado?", bug.reacao.resultadoCSRPreservado)
	fmt.Println("  -> O CSR terminou bem, mas o retorno no primeiro erro rejeitou o lote inteiro: o resultado dele se perdeu.")
	fmt.Println()

	fmt.Println("[Cenário 3] Mesmo cenário, corrigido com a espera pelos dois canais — CAP + idempotência (parágrafo 72-73):")
	corrigido, erro := rodarFluxoTrialForge("Estudo fase II, 12-17 anos", opcoesFluxo{falhasICF: falhasICF{forcarFalhaICF: true}})
	if erro != nil {
		return erro
	}

	fmt.Println("  Resultado do CSR preservado?", corrigido.reacao.resultadoCSRPreservado)
	fmt.Println("  Decisão do Supervisor:", corrigido.decisaoSupervisor)
	fmt.Printf("  Documentos de ICF gravados: %d (%d tentativas registradas nesse único documento)\n", corrigido.documentosGerados, corrigido.tentativasICF)
	fmt.Println("  -> O Supervisor não só decidiu o que refazer: refez de verdade, e o registro idempotente")
	fmt.Println("     garantiu que a segunda tentativa não gerou um segundo documento de ICF.")
	fmt.Println()

	fmt.Println("[Cenário 4] Emenda do comitê de ética chega no meio do caminho — Saga de verdade:")
	divergencia, erro := rodarFluxoTrialForge("Estudo com emenda ética", opcoesFluxo{comEmendaEtica: true})
	if erro != nil {
		return erro
	}

	fmt.Println("  Verificação de consistência:", emJSON(divergencia.verificacao))
	fmt.Println("  Decisão do Supervisor:", divergencia.decisaoSupervisor)
	fmt.Println("  Resultado final do ICF (nunca tocado):", divergencia.reacao.resultadoICF.Secao)
	fmt.Println("  Resultado final do CSR (regenerado):", divergencia.reacao.resultadoCSR.Sintese)
	fmt.Println("  Histórico de revisões do protocolo:", emJSON(divergencia.historico))
	fmt.Println("  -> O ICF terminou ANTES da emenda chegar — seu resultado já nasceu correto, nunca precisou")
	fmt.Println("     ser refeito. O CSR terminou DEPOIS da emenda, mas com o critério antigo — o Supervisor")
	fmt.Println("     detectou e regenerou só a parte dele, exatamente como o Módulo 3.2 promete e o Módulo 3.4")
	fmt.Println("     formaliza como compensação Saga: desfazer só o que precisa, preservando o que já estava certo.")
	fmt.Println()

	fmt.Println("[Cenário 5] CAP completo — timeout real, retry com limite, e o limite esgotando:")
	travado, erro := rodarFluxoTrialForge("Estudo com agente travado", opcoesFluxo{falhasICF: falhasICF{forcarTravamentoICF: true}})
	if erro != nil {
		return erro
	}

	fmt.Println("  Erro do despacho original:", travado.reacao.erroICF)
	fmt.Println("  Decisão do Supervisor:", travado.decisaoSupervisor, fmt.Sprintf("(%d tentativa(s) de retry)", travado.tentativasRetry))
	fmt.Println("  -> O ICF travou de verdade (select com time.After contra um timeout real), não lançou uma exceção —")
	fmt.Println("     e o retry resolveu na primeira tentativa, porque a causa raiz era transitória.")
	fmt.Println()

	esgotado, erro := rodarFluxoTrialForge("Estudo com falha persistente", opcoesFluxo{
		falhasICF:             falhasICF{forcarTravamentoICF: true},
		persistirFalhaNoRetry: true,
	})
	if erro != nil {
		return erro
	}

	fmt.Println("  Agora com falha PERSISTENTE (não transitória):")
	fmt.Println("  Decisão do Supervisor:", esgotado.decisaoSupervisor, fmt.Sprintf("(%d tentativa(s) de retry)", esgotado.tentativasRetry))
	fmt.Printf("  Reação final ok? %t\n", esgotado.reacao.ok)
	fmt.Printf("  -> %d tentativas esgotadas, o Supervisor desiste do ICF e segue em frente sem esse\n", maxTentativas)
	fmt.Println("     resultado — Disponibilidade sobre Consistência, a mesma escolha do Teorema CAP (Módulo 3.4),")
	fmt.Println("     nunca esperar pra sempre por um agente que não vai responder.")
	fmt.Println()

	return nil
}

func encerrarComErro(erro error) {
	fmt.Fprintln(os.Stderr, "[Erro não tratado]", erro)
	os.Exit(1)
}

func main() {
	if erro := rodarTestes(); erro != nil {
		encerrarComErro(erro)
	}
	if erro := demonstrar(); erro != nil {
		encerrarComErro(erro)
	}
}
