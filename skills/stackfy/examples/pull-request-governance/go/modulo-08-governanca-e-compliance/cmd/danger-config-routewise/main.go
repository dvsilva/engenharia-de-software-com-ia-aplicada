package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"unicode/utf8"

	"routewise-governance/internal/governance"
)

const (
	defaultAPIURL    = "https://api.github.com"
	coveragePath     = "coverage/coverage-summary.json"
	baseCoveragePath = "coverage/base-coverage.json"
	invalidCoverage  = "Formato do arquivo de cobertura invalido. Esperado: {'total': {'lines': {'pct': valor}}}."
)

var separator = strings.Repeat("-", 60)

type coverageReport = map[string]any

type pullRequest struct {
	Title        string
	Body         string
	Additions    int
	Deletions    int
	ChangedFiles []string
	Approvals    int
	Coverage     coverageReport
	BaseCoverage coverageReport
}

type pullRequestFields struct {
	Title     string  `json:"title"`
	Body      *string `json:"body"`
	Additions int     `json:"additions"`
	Deletions int     `json:"deletions"`
}

type mockFile struct {
	PR           pullRequestFields   `json:"pr"`
	ChangedFiles []string            `json:"changed_files"`
	Reviews      []governance.Review `json:"reviews"`
	Coverage     coverageReport      `json:"coverage"`
	BaseCoverage coverageReport      `json:"base_coverage"`
}

type changedFile struct {
	Filename string `json:"filename"`
}

type report struct {
	failures []string
	warnings []string
	messages []string
}

type gitHub struct {
	baseURL string
	token   string
}

func main() {
	os.Exit(run())
}

func run() int {
	local := flag.Bool("local", false, "Modo local: le dados do PR de um arquivo JSON (sem GitHub API).")
	mock := flag.String("mock", "pr-mock-routewise.json", "Caminho para o arquivo de mock (default: pr-mock-routewise.json).")
	flag.Parse()

	if *local {
		return checkLocally(*mock)
	}

	return checkOnGitHub()
}

func checkLocally(mockPath string) int {
	if _, err := os.Stat(mockPath); errors.Is(err, os.ErrNotExist) {
		fmt.Printf("Arquivo de mock nao encontrado: %s\n", mockPath)
		fmt.Println("Execute no mesmo diretorio dos materiais ou passe --mock <caminho>.")
		return 1
	}

	pr, err := readMock(mockPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	fmt.Printf("[MODO LOCAL] Lendo PR: %s\n", pr.Title)
	fmt.Printf("Arquivos alterados: %d | Aprovadores: %d | Linhas: %d\n\n", len(pr.ChangedFiles), pr.Approvals, pr.Additions+pr.Deletions)

	result := evaluate(pr, governance.RouteWise)
	printReport(os.Stdout, result)

	return exitCode(result)
}

func checkOnGitHub() int {
	token := os.Getenv("GITHUB_TOKEN")
	repository := os.Getenv("GITHUB_REPOSITORY")
	number := os.Getenv("PR_NUMBER")

	if token == "" || repository == "" || number == "" {
		fmt.Println("Erro: variaveis GITHUB_TOKEN, GITHUB_REPOSITORY e PR_NUMBER sao obrigatorias.")
		fmt.Println("Para rodar localmente use: go run ./cmd/danger-config-routewise --local")
		return 1
	}

	apiURL := os.Getenv("GITHUB_API_URL")
	if apiURL == "" {
		apiURL = defaultAPIURL
	}

	client := gitHub{baseURL: fmt.Sprintf("%s/repos/%s", apiURL, repository), token: token}

	pr, err := fetchPullRequest(client, number)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	result := evaluate(pr, governance.RouteWise)
	printReport(os.Stdout, result)

	if err := client.post(fmt.Sprintf("/issues/%s/comments", number), map[string]string{"body": comment(result)}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	return exitCode(result)
}

func readMock(path string) (pullRequest, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return pullRequest{}, err
	}

	var mock mockFile
	if err := json.Unmarshal(content, &mock); err != nil {
		return pullRequest{}, err
	}

	return pullRequest{
		Title:        mock.PR.Title,
		Body:         governance.TextOrEmpty(mock.PR.Body),
		Additions:    mock.PR.Additions,
		Deletions:    mock.PR.Deletions,
		ChangedFiles: mock.ChangedFiles,
		Approvals:    governance.CountApprovals(mock.Reviews),
		Coverage:     mock.Coverage,
		BaseCoverage: mock.BaseCoverage,
	}, nil
}

func fetchPullRequest(client gitHub, number string) (pullRequest, error) {
	var fields pullRequestFields
	var files []changedFile
	var reviews []governance.Review

	if err := client.get(fmt.Sprintf("/pulls/%s", number), &fields); err != nil {
		return pullRequest{}, err
	}
	if err := client.get(fmt.Sprintf("/pulls/%s/files", number), &files); err != nil {
		return pullRequest{}, err
	}
	if err := client.get(fmt.Sprintf("/pulls/%s/reviews", number), &reviews); err != nil {
		return pullRequest{}, err
	}

	coverage, err := readCoverage(coveragePath)
	if err != nil {
		return pullRequest{}, err
	}

	baseCoverage, err := readCoverage(baseCoveragePath)
	if err != nil {
		return pullRequest{}, err
	}

	filenames := make([]string, len(files))
	for index, file := range files {
		filenames[index] = file.Filename
	}

	return pullRequest{
		Title:        fields.Title,
		Body:         governance.TextOrEmpty(fields.Body),
		Additions:    fields.Additions,
		Deletions:    fields.Deletions,
		ChangedFiles: filenames,
		Approvals:    governance.CountApprovals(reviews),
		Coverage:     coverage,
		BaseCoverage: baseCoverage,
	}, nil
}

func readCoverage(path string) (coverageReport, error) {
	content, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var coverage coverageReport
	if err := json.Unmarshal(content, &coverage); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}

	return coverage, nil
}

func (client gitHub) send(method, endpoint string, body io.Reader) (*http.Response, error) {
	request, err := http.NewRequest(method, client.baseURL+endpoint, body)
	if err != nil {
		return nil, err
	}

	request.Header.Set("Authorization", "Bearer "+client.token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	return http.DefaultClient.Do(request)
}

func (client gitHub) get(endpoint string, target any) error {
	response, err := client.send(http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		return fmt.Errorf("%s for url: %s", response.Status, response.Request.URL)
	}

	return json.NewDecoder(response.Body).Decode(target)
}

func (client gitHub) post(endpoint string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	response, err := client.send(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}

	return response.Body.Close()
}

func evaluate(pr pullRequest, config governance.Config) report {
	var result report

	if !config.ReferencesCard(pr.Title, pr.Body) {
		result.failures = append(result.failures, fmt.Sprintf(
			"Card do Jira nao encontrado. O titulo ou a descricao deve conter o identificador do card (ex: %s-123). Isso garante rastreabilidade entre o PR e o trabalho planejado.",
			config.JiraPrefix,
		))
	}

	if criticalFiles := config.CriticalFiles(pr.ChangedFiles); len(criticalFiles) > 0 {
		listed := strings.Join(criticalFiles, ", ")
		if pr.Approvals < config.CriticalApprovers {
			result.failures = append(result.failures, fmt.Sprintf(
				"Arquivo critico modificado com aprovadores insuficientes. Este PR toca modulos de integracao ou arquivos sensiveis. Necessario pelo menos %d aprovadores (atual: %d). Arquivos criticos: %s",
				config.CriticalApprovers, pr.Approvals, listed,
			))
		} else {
			result.messages = append(result.messages, fmt.Sprintf(
				"Arquivo critico com %d aprovadores -- requisito de revisao atendido. (%s)",
				pr.Approvals, listed,
			))
		}
	}

	if totalChanges := pr.Additions + pr.Deletions; totalChanges > config.LargePRThreshold {
		result.warnings = append(result.warnings, fmt.Sprintf(
			"PR grande detectado (%d linhas alteradas). PRs acima de %d linhas aumentam o risco de bugs. Considere dividir em PRs menores ou agendar revisao dedicada.",
			totalChanges, config.LargePRThreshold,
		))
	}

	result.checkCoverage(pr.Coverage, pr.BaseCoverage, config.CoverageDropThreshold)

	if utf8.RuneCountInString(strings.TrimSpace(pr.Body)) < 30 {
		result.warnings = append(result.warnings,
			"Descricao do PR muito curta ou ausente. Uma boa descricao explica o que muda e por que -- nao apenas lista arquivos. Isso facilita revisao, rollback e historico do projeto.",
		)
	}

	return result
}

func (result *report) checkCoverage(coverage, baseCoverage coverageReport, threshold float64) {
	if len(coverage) == 0 {
		result.messages = append(result.messages,
			"Dados de cobertura nao encontrados. Para ativar esta regra, gere coverage-summary.json no pipeline antes deste step.",
		)
		return
	}

	currentPercentage, found := linePercentage(coverage)
	if !found {
		result.warnings = append(result.warnings, invalidCoverage)
		return
	}

	if len(baseCoverage) == 0 {
		result.messages = append(result.messages, fmt.Sprintf(
			"Cobertura atual: %.1f%%. Cobertura base nao disponivel -- comparacao nao realizada.",
			currentPercentage,
		))
		return
	}

	basePercentage, found := linePercentage(baseCoverage)
	if !found {
		result.warnings = append(result.warnings, invalidCoverage)
		return
	}

	drop := basePercentage - currentPercentage
	if drop > threshold {
		result.warnings = append(result.warnings, fmt.Sprintf(
			"Cobertura de testes caiu %.1f pontos (de %.1f%% para %.1f%%). Queda acima de %g%% indica codigo novo sem cobertura. Adicione testes ou justifique na descricao.",
			drop, basePercentage, currentPercentage, threshold,
		))
		return
	}

	result.messages = append(result.messages, fmt.Sprintf(
		"Cobertura de testes: %.1f%% (queda de %.1fp em relacao a base %.1f%%) -- dentro do limite aceitavel.",
		currentPercentage, drop, basePercentage,
	))
}

func linePercentage(coverage coverageReport) (float64, bool) {
	total, _ := coverage["total"].(map[string]any)
	lines, _ := total["lines"].(map[string]any)
	percentage, found := lines["pct"].(float64)

	return percentage, found
}

func printReport(output io.Writer, result report) {
	fmt.Fprintln(output, separator)
	fmt.Fprintln(output, "GOVERNANCE CHECK -- RESULTADO")
	fmt.Fprintln(output, separator)

	printSection(output, fmt.Sprintf("FALHAS (%d) -- bloqueiam o merge:", len(result.failures)), result.failures)
	printSection(output, fmt.Sprintf("AVISOS (%d) -- nao bloqueiam:", len(result.warnings)), result.warnings)
	printSection(output, fmt.Sprintf("INFORMACAO (%d):", len(result.messages)), result.messages)

	fmt.Fprintln(output)
	fmt.Fprintln(output, separator)
	fmt.Fprintf(output, "Status final: %s\n", result.status())
	fmt.Fprintln(output, "Regras verificadas: referencia Jira, aprovadores para arquivos criticos,")
	fmt.Fprintln(output, "tamanho do PR, cobertura de testes e qualidade da descricao.")
	fmt.Fprintln(output, separator)
}

func printSection(output io.Writer, heading string, items []string) {
	if len(items) == 0 {
		return
	}

	fmt.Fprintf(output, "\n%s\n\n", heading)
	for index, item := range items {
		fmt.Fprintf(output, "  %d. %s\n", index+1, item)
	}
}

func comment(result report) string {
	lines := []string{"**Governance Check (Python) -- Resultado**", ""}

	if len(result.failures) > 0 {
		lines = append(lines, fmt.Sprintf("**FALHAS (%d) -- bloqueiam o merge:**", len(result.failures)))
		lines = append(lines, prefixed("- FALHA: ", result.failures)...)
		lines = append(lines, "")
	}
	if len(result.warnings) > 0 {
		lines = append(lines, fmt.Sprintf("**AVISOS (%d) -- nao bloqueiam:**", len(result.warnings)))
		lines = append(lines, prefixed("- AVISO: ", result.warnings)...)
		lines = append(lines, "")
	}
	if len(result.messages) > 0 {
		lines = append(lines, "**Informacoes:**")
		lines = append(lines, prefixed("- ", result.messages)...)
		lines = append(lines, "")
	}

	lines = append(lines, fmt.Sprintf("Status final: **%s**", result.status()))

	return strings.Join(lines, "\n")
}

func prefixed(prefix string, items []string) []string {
	lines := make([]string, len(items))
	for index, item := range items {
		lines[index] = prefix + item
	}

	return lines
}

func (result report) status() string {
	if len(result.failures) > 0 {
		return "FALHOU"
	}

	return "OK"
}

func exitCode(result report) int {
	if len(result.failures) > 0 {
		return 1
	}

	return 0
}
