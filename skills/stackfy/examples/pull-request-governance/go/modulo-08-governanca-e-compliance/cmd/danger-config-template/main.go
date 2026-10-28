package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"os"
	"slices"
	"strings"
	"unicode/utf16"

	"routewise-governance/internal/governance"
)

const (
	coveragePath     = "./coverage/coverage-summary.json"
	baseCoveragePath = "./coverage/base-coverage.json"
)

type dangerDSL struct {
	Danger struct {
		Git struct {
			CreatedFiles  []string `json:"created_files"`
			ModifiedFiles []string `json:"modified_files"`
		} `json:"git"`
		GitHub struct {
			PR struct {
				Title     string  `json:"title"`
				Body      *string `json:"body"`
				Additions int     `json:"additions"`
				Deletions int     `json:"deletions"`
			} `json:"pr"`
			Reviews []governance.Review `json:"reviews"`
		} `json:"github"`
	} `json:"danger"`
}

type violation struct {
	Message string `json:"message"`
}

type results struct {
	Fails     []violation `json:"fails"`
	Warnings  []violation `json:"warnings"`
	Messages  []violation `json:"messages"`
	Markdowns []violation `json:"markdowns"`
}

type coverageSummary struct {
	Total struct {
		Lines struct {
			Pct *float64 `json:"pct"`
		} `json:"lines"`
	} `json:"total"`
}

func main() {
	var dsl dangerDSL
	if err := json.NewDecoder(os.Stdin).Decode(&dsl); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	if err := json.NewEncoder(os.Stdout).Encode(evaluate(dsl, governance.RouteWise)); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newResults() *results {
	return &results{Fails: []violation{}, Warnings: []violation{}, Messages: []violation{}, Markdowns: []violation{}}
}

func (danger *results) fail(message string) {
	danger.Fails = append(danger.Fails, violation{Message: message})
}

func (danger *results) warn(message string) {
	danger.Warnings = append(danger.Warnings, violation{Message: message})
}

func (danger *results) message(message string) {
	danger.Messages = append(danger.Messages, violation{Message: message})
}

func evaluate(dsl dangerDSL, config governance.Config) *results {
	danger := newResults()
	pr := dsl.Danger.GitHub.PR
	body := governance.TextOrEmpty(pr.Body)

	if !config.ReferencesCard(pr.Title, body) {
		danger.fail(fmt.Sprintf(
			"Card do Jira nao encontrado. O titulo ou a descricao do PR deve conter o identificador do card (ex: `%s-123`). Isso garante rastreabilidade entre o PR e o trabalho planejado.",
			config.JiraPrefix,
		))
	}

	changedFiles := slices.Concat(dsl.Danger.Git.CreatedFiles, dsl.Danger.Git.ModifiedFiles)
	if criticalFiles := config.CriticalFiles(changedFiles); len(criticalFiles) > 0 {
		approvals := governance.CountApprovals(dsl.Danger.GitHub.Reviews)
		if approvals < config.CriticalApprovers {
			danger.fail(fmt.Sprintf(
				"Arquivo critico modificado com aprovadores insuficientes. Este PR toca modulos de integracao ou arquivos sensiveis. Necessario pelo menos %d aprovadores (atual: %d). Arquivos criticos detectados: %s",
				config.CriticalApprovers, approvals, strings.Join(criticalFiles, ", "),
			))
		} else {
			danger.message(fmt.Sprintf("Arquivo critico com %d aprovadores -- requisito de revisao atendido.", approvals))
		}
	}

	if totalChanges := pr.Additions + pr.Deletions; totalChanges > config.LargePRThreshold {
		danger.warn(fmt.Sprintf(
			"PR grande detectado (%d linhas alteradas). PRs acima de %d linhas aumentam o risco de bugs passarem despercebidos. Considere dividir em PRs menores ou agendar uma sessao de revisao dedicada.",
			totalChanges, config.LargePRThreshold,
		))
	}

	danger.checkCoverage(config.CoverageDropThreshold)

	if len(utf16.Encode([]rune(strings.TrimSpace(body)))) < 30 {
		danger.warn("Descricao do PR muito curta ou ausente. Uma boa descricao explica o que muda e por que -- nao apenas lista arquivos alterados. Isso facilita revisao, facilita rollback e fica no historico do projeto.")
	}

	danger.message("Danger check concluido. Regras verificadas: referencia Jira, aprovadores para arquivos criticos, tamanho do PR, cobertura de testes e qualidade da descricao. Itens marcados como falha bloqueiam o merge. Avisos nao bloqueiam.")

	return danger
}

func (danger *results) checkCoverage(threshold float64) {
	coverage, err := readCoverage(coveragePath)
	if errors.Is(err, os.ErrNotExist) {
		danger.message(fmt.Sprintf(
			"Arquivo de cobertura nao encontrado em %s. Para ativar esta regra: configure Jest com --coverage --coverageReporters=json-summary.",
			coveragePath,
		))
		return
	}
	if err != nil {
		danger.warnUnreadableCoverage()
		return
	}

	current := coverage.Total.Lines.Pct
	base, err := readCoverage(baseCoveragePath)
	if current == nil || errors.Is(err, os.ErrNotExist) {
		danger.message(fmt.Sprintf(
			"Cobertura atual: %s%%. Arquivo de cobertura base nao encontrado -- comparacao nao realizada.",
			fixedOrUnavailable(current),
		))
		return
	}
	if err != nil {
		danger.warnUnreadableCoverage()
		return
	}

	if basePercentage := base.Total.Lines.Pct; basePercentage != nil && *basePercentage-*current > threshold {
		danger.warn(fmt.Sprintf(
			"Cobertura de testes caiu %s pontos (de %s%% para %s%%). Queda acima de %g%% indica codigo novo sem cobertura. Adicione testes ou justifique na descricao do PR.",
			toFixed(*basePercentage-*current), toFixed(*basePercentage), toFixed(*current), threshold,
		))
		return
	}

	danger.message(fmt.Sprintf("Cobertura de testes: %s%% -- dentro do limite aceitavel.", toFixed(*current)))
}

func (danger *results) warnUnreadableCoverage() {
	danger.warn("Nao foi possivel ler o arquivo de cobertura de testes. Verifique se o Jest esta configurado com coverageReporters: json-summary.")
}

func readCoverage(path string) (coverageSummary, error) {
	var coverage coverageSummary

	content, err := os.ReadFile(path)
	if err != nil {
		return coverage, err
	}

	return coverage, json.Unmarshal(content, &coverage)
}

func fixedOrUnavailable(percentage *float64) string {
	if percentage == nil {
		return "indisponivel"
	}

	return toFixed(*percentage)
}

// JavaScript's toFixed(1) rounds exact ties away from zero, while fmt rounds them to even.
func toFixed(value float64) string {
	sign := ""
	if value < 0 {
		sign = "-"
	}

	tenths := new(big.Float).SetPrec(128).SetFloat64(math.Abs(value))
	tenths.Mul(tenths, big.NewFloat(10)).Add(tenths, big.NewFloat(0.5))
	rounded, _ := tenths.Int64()

	return fmt.Sprintf("%s%d.%d", sign, rounded/10, rounded%10)
}
