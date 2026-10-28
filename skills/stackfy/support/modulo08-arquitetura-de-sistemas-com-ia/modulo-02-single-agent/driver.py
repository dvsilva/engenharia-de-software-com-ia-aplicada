import json
import sys

from provedores_pagos import chamar_claude, chamar_gemini, chamar_gpt

protocolo = sys.argv[1]
historico = [
    {
        "role": "user",
        "content": (
            f"Protocolo do estudo: {protocolo}\n\n"
            "Jurisdição regulatória deste estudo: ANVISA.\n\n"
            "Gere a seção de assentimento do ICF (Termo de Consentimento) para este estudo, "
            "se aplicável. Use a ferramenta disponível para buscar a cláusula regulatória "
            "correta antes de escrever o texto."
        ),
    }
]

print(json.dumps(chamar_claude(historico), ensure_ascii=False))
print(json.dumps(chamar_gemini(protocolo), ensure_ascii=False))
print(json.dumps(chamar_gpt(historico), ensure_ascii=False))
