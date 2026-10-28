//go:build js && wasm

package main

import (
	"strconv"
	"strings"
	"syscall/js"
	"time"
)

type aiContext struct {
	session         js.Value
	abortController js.Value
	isGenerating    bool
}

type pageElements struct {
	temperature      js.Value
	temperatureValue js.Value
	topKValue        js.Value
	topK             js.Value
	form             js.Value
	questionInput    js.Value
	output           js.Value
	button           js.Value
	year             js.Value
}

type promiseError struct {
	reason js.Value
}

const systemPrompt = `
                Você é um assistente de IA que responde de forma clara e objetiva.
                Responda sempre em formato de texto ao invés de markdown`

var (
	global   = js.Global()
	console  = global.Get("console")
	document = global.Get("document")
	ai       = aiContext{}
	elements = pageElements{
		temperature:      byID("temperature"),
		temperatureValue: byID("temp-value"),
		topKValue:        byID("topk-value"),
		topK:             byID("topK"),
		form:             byID("question-form"),
		questionInput:    byID("question"),
		output:           byID("output"),
		button:           byID("ask-button"),
		year:             byID("year"),
	}
	expectedLanguages = []any{"pt"}
)

func (failure promiseError) Error() string {
	message := failure.reason.Get("message")
	if message.Type() == js.TypeString {
		return message.String()
	}
	return failure.reason.Call("toString").String()
}

func byID(id string) js.Value {
	return document.Call("getElementById", id)
}

func languageModel() js.Value {
	return global.Get("LanguageModel")
}

func await(promise js.Value) (js.Value, error) {
	values := make(chan js.Value, 1)
	failures := make(chan js.Value, 1)
	resolve := js.FuncOf(func(this js.Value, args []js.Value) any {
		values <- args[0]
		return nil
	})
	reject := js.FuncOf(func(this js.Value, args []js.Value) any {
		failures <- args[0]
		return nil
	})
	defer resolve.Release()
	defer reject.Release()

	promise.Call("then", resolve, reject)

	select {
	case value := <-values:
		return value, nil
	case reason := <-failures:
		return js.Undefined(), promiseError{reason}
	}
}

func listen(element js.Value, event string, handle func(event js.Value)) {
	element.Call("addEventListener", event, js.FuncOf(func(this js.Value, args []js.Value) any {
		handle(args[0])
		return nil
	}))
}

func setupEventListeners() {
	listen(elements.temperature, "input", func(event js.Value) {
		elements.temperatureValue.Set("textContent", event.Get("target").Get("value"))
	})
	listen(elements.topK, "input", func(event js.Value) {
		elements.topKValue.Set("textContent", event.Get("target").Get("value"))
	})
	listen(elements.form, "submit", func(event js.Value) {
		event.Call("preventDefault")

		if ai.isGenerating {
			toggleSendOrStopButton(false)
			return
		}

		go onSubmitQuestion()
	})
}

func onSubmitQuestion() {
	question := elements.questionInput.Get("value").String()
	if strings.TrimSpace(question) == "" {
		return
	}

	temperature, _ := strconv.ParseFloat(elements.temperature.Get("value").String(), 64)
	topK, _ := strconv.Atoi(elements.topK.Get("value").String())

	console.Call("log", "Using parameters:", map[string]any{"temperature": temperature, "topK": topK})
	toggleSendOrStopButton(true)
	elements.output.Set("textContent", "Processing your question...")

	reader, err := askAI(question, temperature, topK)
	if err != nil {
		console.Call("error", "Error asking the model:", err.Error())
		toggleSendOrStopButton(false)
		return
	}

	elements.output.Set("textContent", "")
	if err := readChunks(reader); err != nil {
		return
	}
	toggleSendOrStopButton(false)
}

func readChunks(reader js.Value) error {
	for {
		result, err := await(reader.Call("read"))
		if err != nil {
			return err
		}
		if result.Get("done").Bool() || ai.abortController.Get("signal").Get("aborted").Bool() {
			return nil
		}

		chunk := result.Get("value").String()

		console.Call("log", "Received chunk:", chunk)
		elements.output.Set("textContent", elements.output.Get("textContent").String()+chunk)
	}
}

func toggleSendOrStopButton(isGenerating bool) {
	if isGenerating {
		ai.isGenerating = true
		elements.button.Set("textContent", "Parar")
		elements.button.Get("classList").Call("add", "stop-button")
		return
	}

	if !ai.abortController.IsUndefined() {
		ai.abortController.Call("abort")
	}
	ai.isGenerating = false
	elements.button.Set("textContent", "Enviar")
	elements.button.Get("classList").Call("remove", "stop-button")
}

func askAI(question string, temperature float64, topK int) (js.Value, error) {
	if !ai.abortController.IsUndefined() {
		ai.abortController.Call("abort")
	}
	ai.abortController = global.Get("AbortController").New()

	if !ai.session.IsUndefined() {
		ai.session.Call("destroy")
	}

	session, err := await(languageModel().Call("create", map[string]any{
		"expectedInputLanguages": expectedLanguages,
		"temperature":            temperature,
		"topK":                   topK,
		"initialPrompts": []any{
			map[string]any{"role": "system", "content": systemPrompt},
		},
	}))
	if err != nil {
		return js.Undefined(), err
	}

	ai.session = session
	stream := session.Call(
		"promptStreaming",
		[]any{map[string]any{"role": "user", "content": question}},
		map[string]any{"signal": ai.abortController.Get("signal")},
	)

	return stream.Call("getReader"), nil
}

func logDownloadProgress(monitor js.Value) {
	listen(monitor, "downloadprogress", func(event js.Value) {
		percent := event.Get("loaded").Float() / event.Get("total").Float() * 100

		console.Call("log", "Downloaded "+strconv.FormatFloat(percent, 'f', 0, 64)+"%")
	})
}

func downloadModel() error {
	monitor := js.FuncOf(func(this js.Value, args []js.Value) any {
		logDownloadProgress(args[0])
		return nil
	})
	defer monitor.Release()

	session, err := await(languageModel().Call("create", map[string]any{
		"expectedInputLanguages": expectedLanguages,
		"monitor":                monitor,
	}))
	if err != nil {
		return err
	}

	if _, err := await(session.Call("prompt", "Olá")); err != nil {
		return err
	}
	session.Call("destroy")

	return nil
}

func availability() (string, error) {
	state, err := await(languageModel().Call("availability", map[string]any{"languages": expectedLanguages}))
	if err != nil {
		return "", err
	}
	return state.String(), nil
}

func checkRequirements() ([]string, error) {
	errors := []string{}

	if !global.Get("chrome").Truthy() {
		errors = append(errors, "⚠️ Este recurso só funciona no Google Chrome ou Chrome Canary (versão recente).")
	}
	if languageModel().IsUndefined() {
		return append(errors,
			"⚠️ As APIs nativas de IA não estão ativas.",
			"Ative a seguinte flag em chrome://flags/:",
			"- Prompt API for Gemini Nano (chrome://flags/#prompt-api-for-gemini-nano)",
			"Depois reinicie o Chrome e tente novamente.",
		), nil
	}

	state, err := availability()
	if err != nil {
		return nil, err
	}
	console.Call("log", "Language Model Availability:", state)

	switch state {
	case "available":
		return errors, nil
	case "unavailable":
		return append(errors, "⚠️ O seu dispositivo não suporta modelos de linguagem nativos de IA."), nil
	case "downloading":
		return append(errors, "⚠️ O modelo de linguagem de IA está sendo baixado. Por favor, aguarde alguns minutos e tente novamente."), nil
	case "downloadable":
		return checkDownload(errors)
	}

	return errors, nil
}

func checkDownload(errors []string) ([]string, error) {
	errors = append(errors, "⚠️ O modelo de linguagem de IA precisa ser baixado, baixando agora... (acompanhe o progresso no terminal do chrome)")

	if err := downloadModel(); err != nil {
		console.Call("error", "Error downloading model:", err.Error())
		return append(errors, "⚠️ Erro ao baixar o modelo: "+err.Error()), nil
	}

	state, err := availability()
	if err != nil {
		return nil, err
	}
	if state == "available" {
		return nil, nil
	}

	return errors, nil
}

func showParameters() error {
	params, err := await(languageModel().Call("params"))
	if err != nil {
		return err
	}

	console.Call("log", "Language Model Params:", params)

	elements.topK.Set("max", params.Get("maxTopK"))
	elements.topK.Set("min", 1)
	elements.topK.Set("value", params.Get("defaultTopK"))
	elements.topKValue.Set("textContent", params.Get("defaultTopK"))

	elements.temperatureValue.Set("textContent", params.Get("defaultTemperature"))
	elements.temperature.Set("max", params.Get("maxTemperature"))
	elements.temperature.Set("min", 0)
	elements.temperature.Set("value", params.Get("defaultTemperature"))

	return nil
}

func start() error {
	elements.year.Set("textContent", time.Now().Year())

	requirementErrors, err := checkRequirements()
	if err != nil {
		return err
	}
	if len(requirementErrors) > 0 {
		elements.output.Set("innerHTML", strings.Join(requirementErrors, "<br/>"))
		elements.button.Set("disabled", true)
		return nil
	}

	if err := showParameters(); err != nil {
		return err
	}

	setupEventListeners()

	return nil
}

func main() {
	if err := start(); err != nil {
		console.Call("error", err.Error())
	}

	select {}
}
