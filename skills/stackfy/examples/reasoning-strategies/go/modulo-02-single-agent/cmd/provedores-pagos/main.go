package main

import (
	"context"
	"fmt"
	"os"

	"trialforge-single-agent/internal/jsontext"
	"trialforge-single-agent/provedores"
)

func pedidoICF(protocolo string) string {
	return "Protocolo do estudo: " + protocolo + "\n\n" +
		"Jurisdição regulatória deste estudo: ANVISA.\n\n" +
		"Gere a seção de assentimento do ICF (Termo de Consentimento) para este estudo, se aplicável. " +
		"Use a ferramenta disponível para buscar a cláusula regulatória correta antes de escrever o texto."
}

func rodar(ctx context.Context, protocolo string) error {
	historico := []provedores.Mensagem{{Role: "user", Content: pedidoICF(protocolo)}}
	chamadas := []func() (provedores.Resultado, error){
		func() (provedores.Resultado, error) { return provedores.ChamarClaude(ctx, historico) },
		func() (provedores.Resultado, error) { return provedores.ChamarGemini(ctx, protocolo) },
		func() (provedores.Resultado, error) { return provedores.ChamarGPT(ctx, historico) },
	}

	for _, chamar := range chamadas {
		resultado, err := chamar()
		if err != nil {
			return err
		}
		fmt.Println(jsontext.Compact(resultado))
	}

	return nil
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "uso: provedores-pagos <protocolo>")
		os.Exit(64)
	}
	if err := rodar(context.Background(), os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
