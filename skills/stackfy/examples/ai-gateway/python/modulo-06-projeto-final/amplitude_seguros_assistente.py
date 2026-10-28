import json
import math
import os
import re
import subprocess
import sys
import traceback
import urllib.error
import urllib.request
from pathlib import Path

REGIAO = "us-central1"

PALAVRAS_AUTO = ["placa", "veículo", "veiculo", "oficina", "funilaria", "para-choque", "parachoque", "lataria", "pintura"]
PALAVRAS_SAUDE = [
    "beneficiário", "beneficiario", "procedimento", "clínica", "clinica", "consulta",
    "exame", "hospital", "paciente", "convênio", "convenio",
]

INSTRUCOES = {
    "amplitude-auto": "Extraia segurado, placa e valor do orçamento de oficina abaixo.",
    "amplitude-saude-empresarial": "Extraia beneficiário, procedimento e valor do recibo médico abaixo.",
}

CAMPOS_ESPERADOS = {
    "amplitude-auto": ["segurado", "placa", "valor"],
    "amplitude-saude-empresarial": ["beneficiario", "procedimento", "valor"],
}

FLAGS_CONHECIDAS = ["--local", "--skip-tests"]
USO = 'Uso: python3 amplitude_seguros_assistente.py [--local] [--skip-tests] "<texto do usuário>"'
DICA_LOCAL = (
    "Verifique o checkpoint MLX (rode colab-local-model-notebook.ipynb até o Passo 4, ou treine com "
    "mlx_lm lora), a instalação do mlx-lm, e se python3 está no PATH."
)
DICA_NUVEM = "Verifique a autenticação (gcloud auth login) e a conexão de rede, e tente de novo."

CERCA_MARKDOWN = re.compile(r"^```(?:json)?\s*([\s\S]*?)\s*```$")


def contar_ocorrencias(texto_minusculo, palavras):
    return sum(1 for palavra in palavras if palavra in texto_minusculo)


def classificar_dominio(texto):
    texto_minusculo = texto.lower()
    score_auto = contar_ocorrencias(texto_minusculo, PALAVRAS_AUTO)
    score_saude = contar_ocorrencias(texto_minusculo, PALAVRAS_SAUDE)
    scores = {"scoreAuto": score_auto, "scoreSaude": score_saude}

    if score_auto == 0 and score_saude == 0:
        return {"dominio": None, "motivo": "fora_do_escopo", **scores}
    if score_auto == score_saude:
        return {"dominio": None, "motivo": "ambiguo", **scores}

    dominio = "amplitude-auto" if score_auto > score_saude else "amplitude-saude-empresarial"
    return {"dominio": dominio, "motivo": "ok", **scores}


def obter_token_acesso():
    return subprocess.run(
        ["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True
    ).stdout.strip()


def obter_endpoint():
    endpoint = os.environ.get("ENDPOINT_MODULO32")
    if not endpoint:
        raise RuntimeError(
            "Defina a variável de ambiente ENDPOINT_MODULO32 com o endpoint do seu modelo publicado "
            "no Módulo 3.2 antes de rodar este script."
        )
    return endpoint


def chamar_modelo_real(exemplo):
    token = obter_token_acesso()
    base = os.environ.get("GOOGLE_VERTEX_BASE_URL", f"https://{REGIAO}-aiplatform.googleapis.com")
    corpo = {
        "contents": [{"role": "user", "parts": [{"text": f"{exemplo['instrucao']}\n\n{exemplo['entrada']}"}]}],
        "generationConfig": {"temperature": 0},
    }
    requisicao = urllib.request.Request(
        f"{base}/v1/{obter_endpoint()}:generateContent",
        data=json.dumps(corpo).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(requisicao) as resposta:
            dados = json.loads(resposta.read())
    except urllib.error.HTTPError as erro:
        raise RuntimeError(f"Falha ao chamar o modelo: {erro.code} {erro.reason}") from erro
    return dados["candidates"][0]["content"]["parts"][0]["text"]


def chamar_modelo_local(instrucao, entrada):
    script_local = Path(__file__).parent / "chamar_modelo_local.py"
    try:
        resultado = subprocess.run(
            ["python3", str(script_local)],
            input=json.dumps({"instrucao": instrucao, "entrada": entrada}),
            capture_output=True,
            text=True,
        )
    except OSError as erro:
        raise RuntimeError(
            f'Falha ao chamar o modelo local: não foi possível executar "python3" ({erro}). '
            "Verifique se o Python está instalado e no PATH."
        ) from erro
    if resultado.returncode != 0:
        raise RuntimeError(f"Falha ao chamar o modelo local: {resultado.stderr}")
    return resultado.stdout.strip()


def chamar_modelo(dominio, texto, local=False, chamar_local=chamar_modelo_local, chamar_nuvem=chamar_modelo_real):
    instrucao = INSTRUCOES[dominio]
    if local:
        return chamar_local(instrucao, texto)
    return chamar_nuvem({"instrucao": instrucao, "entrada": texto})


def remover_cerca_markdown(texto):
    sem_cerca = CERCA_MARKDOWN.match(texto.strip())
    return sem_cerca.group(1) if sem_cerca else texto


def avaliar_adequacao_schema(caso, texto_resposta):
    try:
        objeto = json.loads(remover_cerca_markdown(texto_resposta))
    except json.JSONDecodeError:
        return {"valido": False, "motivo": "resposta não é JSON válido", "campos": None}
    if not isinstance(objeto, dict):
        return {"valido": False, "motivo": "resposta não é um objeto JSON", "campos": None}

    esperados = CAMPOS_ESPERADOS[caso]
    faltando = [campo for campo in esperados if campo not in objeto]
    extras = [chave for chave in objeto if chave not in esperados]
    return {"valido": not faltando and not extras, "faltando": faltando, "extras": extras, "campos": objeto}


def como_numero(valor):
    if isinstance(valor, (int, float)):
        return float(valor)
    if not isinstance(valor, str):
        return math.nan
    try:
        return float(valor.strip() or "0")
    except ValueError:
        return math.nan


def avaliar_consistencia_de_valores(dominio, campos):
    problemas = []
    valor = campos.get("valor")
    if valor is None or valor == "" or not math.isfinite(como_numero(valor)):
        problemas.append("valor não é um número válido")

    campos_texto = ["segurado", "placa"] if dominio == "amplitude-auto" else ["beneficiario", "procedimento"]
    for campo in campos_texto:
        conteudo = campos.get(campo)
        if not isinstance(conteudo, str) or not conteudo.strip():
            problemas.append(f"{campo} está vazio ou não é texto")
    return {"valido": not problemas, "problemas": problemas}


def formatar_moeda(valor):
    agrupado = f"{como_numero(valor):,.2f}"
    return "R$ " + agrupado.replace(",", "_").replace(".", ",").replace("_", ".")


def formatar_resposta(dominio, campos):
    valor = formatar_moeda(campos["valor"])
    if dominio == "amplitude-auto":
        return (
            f"Recebi seu orçamento. Segurado: {campos['segurado']}, placa: {campos['placa']}, "
            f"valor: {valor}. Confirma esses dados?"
        )
    return (
        f"Recebi seu recibo médico. Beneficiário: {campos['beneficiario']}, "
        f"procedimento: {campos['procedimento']}, valor: {valor}. Confirma esses dados?"
    )


def processar_mensagem(texto, **opcoes):
    classificacao = classificar_dominio(texto)

    if classificacao["motivo"] == "fora_do_escopo":
        return {
            "tipo": "fora_do_escopo",
            "mensagem": (
                "Isso parece um caso fora do escopo aprovado pro Amplitude Auto e Saúde Empresarial "
                "(ex.: Atendimento ao Cliente). Encaminhando pra um especialista humano."
            ),
            "classificacao": classificacao,
        }
    if classificacao["motivo"] == "ambiguo":
        return {
            "tipo": "ambiguo",
            "mensagem": (
                "Não consegui identificar com confiança se isso é um caso de Amplitude Auto ou de "
                "Saúde Empresarial. Pode confirmar qual dos dois é?"
            ),
            "classificacao": classificacao,
        }

    texto_resposta = chamar_modelo(classificacao["dominio"], texto, **opcoes)
    schema = avaliar_adequacao_schema(classificacao["dominio"], texto_resposta)
    if not schema["valido"]:
        return {
            "tipo": "schema_invalido",
            "mensagem": (
                "O modelo não devolveu um resultado completo dessa vez. Tente reformular a mensagem "
                "ou tente de novo."
            ),
            "classificacao": classificacao,
            "schema": schema,
        }

    consistencia = avaliar_consistencia_de_valores(classificacao["dominio"], schema["campos"])
    if not consistencia["valido"]:
        return {
            "tipo": "schema_invalido",
            "mensagem": (
                "O modelo devolveu os campos certos, mas com um valor que não faz sentido "
                "(ex.: valor não numérico). Tente reformular a mensagem ou tente de novo."
            ),
            "classificacao": classificacao,
            "schema": schema,
        }

    return {
        "tipo": "sucesso",
        "mensagem": formatar_resposta(classificacao["dominio"], schema["campos"]),
        "classificacao": classificacao,
        "schema": schema,
    }


class Suite:
    def __init__(self):
        self.total = 0
        self.falhas = 0

    def testar(self, descricao, verificacao):
        self.total += 1
        try:
            verificacao()
            print(f"  [OK] {descricao}")
        except Exception as erro:
            self.falhas += 1
            print(f"  [FALHOU] {descricao}")
            print(f"           {erro}")


def rodar_testes():
    print("== Testes: amplitude-seguros-assistente ==")
    suite = Suite()

    def auto_real():
        resultado = classificar_dominio(
            "Bom dia, segue o orçamento da oficina Rio Bonito pro veículo do segurado Carlos Eduardo "
            "Matos Silva, placa QWE-4521, conserto do para-lama, valor total R$ 1.870,50."
        )
        assert resultado["dominio"] == "amplitude-auto" and resultado["motivo"] == "ok"

    def saude_real():
        resultado = classificar_dominio(
            "Olá, envio o recibo da Clínica Vitalis. Beneficiária Ana Paula Ferreira Souza, "
            "procedimento consulta cardiológica, valor R$ 350,00."
        )
        assert resultado["dominio"] == "amplitude-saude-empresarial" and resultado["motivo"] == "ok"

    def fora_do_escopo():
        resultado = classificar_dominio(
            "Preciso contestar a negativa de cobertura do meu sinistro, acho que não foi avaliado "
            "corretamente, quero abrir uma reclamação."
        )
        assert resultado["dominio"] is None and resultado["motivo"] == "fora_do_escopo"

    texto_ambiguo = (
        "Preciso de ajuda com meu caso: tem uma questão de placa do veículo e também um procedimento "
        "de exame envolvido."
    )

    def ambiguo():
        resultado = classificar_dominio(texto_ambiguo)
        assert resultado["dominio"] is None and resultado["motivo"] == "ambiguo"
        assert resultado["scoreAuto"] > 0 and resultado["scoreAuto"] == resultado["scoreSaude"]

    def rejeita_valor_textual():
        resultado = avaliar_consistencia_de_valores(
            "amplitude-auto", {"segurado": "X", "placa": "Y", "valor": "não informado"}
        )
        assert not resultado["valido"] and any("valor" in problema for problema in resultado["problemas"])

    def aceita_campos_validos():
        resultado = avaliar_consistencia_de_valores("amplitude-auto", {"segurado": "X", "placa": "Y", "valor": 1870.5})
        assert resultado["valido"] and not resultado["problemas"]

    def confirmacao_auto():
        mensagem = formatar_resposta("amplitude-auto", {"segurado": "Ana", "placa": "ABC-1234", "valor": 1000})
        assert "Ana" in mensagem and "ABC-1234" in mensagem and "R$ 1.000,00" in mensagem

    def confirmacao_saude():
        mensagem = formatar_resposta(
            "amplitude-saude-empresarial", {"beneficiario": "Bruno", "procedimento": "consulta", "valor": 250.5}
        )
        assert "Bruno" in mensagem and "consulta" in mensagem and "R$ 250,50" in mensagem

    def mensagem_fora_do_escopo():
        resultado = processar_mensagem("Quero contestar a negativa de cobertura do sinistro, isso é uma reclamação.")
        assert resultado["tipo"] == "fora_do_escopo"

    def mensagem_ambigua():
        assert processar_mensagem(texto_ambiguo)["tipo"] == "ambiguo"

    def endpoint_real():
        resultado = processar_mensagem(
            "Segue orçamento da Oficina Boa Vista: segurado Ricardo Alves Monteiro, placa JBR-9021, "
            "valor do reparo R$ 2.820,00."
        )
        assert resultado["tipo"] == "sucesso" and resultado["classificacao"]["dominio"] == "amplitude-auto"
        assert "Ricardo Alves Monteiro" in resultado["mensagem"]

    def json_malformado():
        resultado = processar_mensagem(
            "Segue orçamento da Oficina Boa Vista: segurado João Silva, placa ABC-1234, valor do reparo R$ 100,00.",
            chamar_nuvem=lambda _exemplo: '{"segurado":"João Silva","placa":"ABC-1234","valor":100',
        )
        assert resultado["tipo"] == "schema_invalido" and not resultado["schema"]["valido"]
        assert "JSON" in resultado["schema"]["motivo"], f'motivo esperado mencionar JSON, veio "{resultado["schema"]["motivo"]}"'

    def roteamento(local, esperado):
        chamados = []
        resposta = chamar_modelo(
            "amplitude-auto",
            "texto qualquer",
            local=local,
            chamar_local=lambda _instrucao, _entrada: chamados.append("local") or "resposta local",
            chamar_nuvem=lambda _exemplo: chamados.append("nuvem") or "resposta nuvem",
        )
        assert chamados == [esperado] and resposta == f"resposta {esperado}"

    suite.testar("mensagem real de Auto (texto corrido, não o gerador) classifica como amplitude-auto", auto_real)
    suite.testar("mensagem real de Saúde (texto corrido) classifica como amplitude-saude-empresarial", saude_real)
    suite.testar("mensagem de Atendimento ao Cliente (fora do escopo) não vira nenhum dos dois domínios", fora_do_escopo)
    suite.testar(
        "mensagem com vocabulário dos dois domínios ao mesmo tempo é sinalizada como ambígua, não decidida no chute",
        ambiguo,
    )
    suite.testar(
        'avaliar_consistencia_de_valores rejeita valor não numérico (achado real: virava "R$ NaN" apresentado como sucesso)',
        rejeita_valor_textual,
    )
    suite.testar("avaliar_consistencia_de_valores aceita campos válidos", aceita_campos_validos)
    suite.testar("formatar_resposta produz confirmação em linguagem natural pra Auto", confirmacao_auto)
    suite.testar("formatar_resposta produz confirmação em linguagem natural pra Saúde", confirmacao_saude)
    suite.testar("processar_mensagem, caso fora do escopo, não chama o modelo (sem custo de API)", mensagem_fora_do_escopo)
    suite.testar("processar_mensagem, caso ambíguo, não chama o modelo (sem custo de API)", mensagem_ambigua)
    suite.testar(
        "processar_mensagem, caso real de Auto, chama o endpoint de verdade e devolve confirmação válida", endpoint_real
    )
    suite.testar(
        "processar_mensagem, JSON malformado (chave de fechamento ausente) vira schema_invalido, não sucesso silencioso",
        json_malformado,
    )
    suite.testar(
        "chamar_modelo roteia pro caminho local (nunca a nuvem) quando local=True", lambda: roteamento(True, "local")
    )
    suite.testar(
        "chamar_modelo roteia pra nuvem (nunca o local) quando local está ausente/False",
        lambda: roteamento(False, "nuvem"),
    )

    print()
    print(
        f"Total: {suite.total} teste(s), {suite.total - suite.falhas} passou(passaram), "
        f"{suite.falhas} falhou(falharam)."
    )
    if suite.falhas > 0:
        raise RuntimeError(f"{suite.falhas} teste(s) falharam. A implementação não bate com a especificação.")


def main(argumentos):
    flag_desconhecida = next(
        (argumento for argumento in argumentos if argumento.startswith("--") and argumento not in FLAGS_CONHECIDAS),
        None,
    )
    if flag_desconhecida is not None:
        print(f'Flag desconhecida: "{flag_desconhecida}". Flags aceitas: {", ".join(FLAGS_CONHECIDAS)}.', file=sys.stderr)
        print(USO, file=sys.stderr)
        return 1

    local = "--local" in argumentos
    texto = " ".join(argumento for argumento in argumentos if argumento not in FLAGS_CONHECIDAS)

    if "--skip-tests" not in argumentos:
        rodar_testes()

    if not texto:
        print(f"\n{USO}")
        return 0

    print("\n== Processando mensagem ==")
    print(f'Entrada: "{texto}"\n')
    resultado = processar_mensagem(texto, local=local)
    if resultado["tipo"] in ("fora_do_escopo", "ambiguo"):
        modelo_usado = "nenhum modelo chamado, filtro de classificação"
    else:
        modelo_usado = "modelo local" if local else "Vertex AI"
    print(f"[{resultado['tipo']}] ({modelo_usado}) {resultado['mensagem']}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as erro:
        sys.stdout.flush()
        print(f"\nErro: {erro}", file=sys.stderr)
        print(DICA_LOCAL if "--local" in sys.argv[1:] else DICA_NUVEM, file=sys.stderr)
        if os.environ.get("DEBUG"):
            traceback.print_exc()
        sys.exit(1)
