# PAPEL

Atue como um Engenheiro Front-end Sênior especialista em React 19, acessibilidade e Design Systems.

# OBJETIVO

Analisar a imagem de alta fidelidade do Figma (@extrato-figma.png) e as especificações de layout (@figma-specs.txt) para gerar um componente React que renderize essa lista de transações.

# DIRETRIZES TÉCNICAS

1. **Arquitetura de Dados:** Crie um componente de função chamado `PixHistory`. Defina um `type` TypeScript para a transação (`id`, `title`, `amount`, `type`, `date`) e use um array mockado de 3 transações para popular a tela.
2. **Renderização de Listas:** No JSX, você DEVE iterar sobre o array de transações com `map`, usando o `id` como `key`.
3. **Fidelidade e Tokens:** O layout deve espelhar a imagem do Figma, aplicando as regras de flexbox do arquivo de especificações. É ESTRITAMENTE PROIBIDO usar cores hexadecimais absolutas. Leia o @src/styles.css e consuma as nossas variáveis nativas.
4. **Ícones:** Use a biblioteca oficial do @material-symbols-outlined para representar setas de envio/recebimento.

# FORMATO DE SAÍDA

Gere os arquivos `.tsx` e `.css` do componente.
