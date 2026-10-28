#include <algorithm>
#include <array>
#include <functional>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace classificacao {
constexpr std::string_view regra_deterministica = "Regra determinística";
constexpr std::string_view approval_gate = "Agente com Approval Gate obrigatório";
constexpr std::string_view agente_autonomo = "Agente autônomo, com observabilidade completa";
constexpr std::string_view regra_enumeravel =
    "Regra determinística (mesmo parecendo complexa, se é enumerável, é regra)";
}  // namespace classificacao

struct Subtarefa {
    std::string nome;
    std::string tipo;
    bool p1;
    bool p2;
    bool p3;
};

struct SubtarefaClassificada : Subtarefa {
    std::string_view classificacao;
};

struct Combinacao {
    std::string_view descricao;
    bool p1;
    bool p2;
    bool p3;
    std::string_view esperada;
};

struct Caso {
    std::string_view rotulo;
    bool p1;
    bool p2;
    bool p3;
};

constexpr std::array combinacoes{
    Combinacao{"p1=true, p2=true,  p3=true  -> Regra determinística", true, true, true,
               classificacao::regra_deterministica},
    Combinacao{"p1=true, p2=true,  p3=false -> Regra determinística", true, true, false,
               classificacao::regra_deterministica},
    Combinacao{"p1=true, p2=false, p3=true  -> Regra determinística", true, false, true,
               classificacao::regra_deterministica},
    Combinacao{"p1=true, p2=false, p3=false -> Regra determinística", true, false, false,
               classificacao::regra_deterministica},
    Combinacao{"p1=false, p2=true, p3=true  -> Agente com Approval Gate obrigatório", false, true, true,
               classificacao::approval_gate},
    Combinacao{"p1=false, p2=true, p3=false -> Agente com Approval Gate obrigatório", false, true, false,
               classificacao::approval_gate},
    Combinacao{"p1=false, p2=false, p3=true  -> Agente autônomo, com observabilidade completa", false, false,
               true, classificacao::agente_autonomo},
    Combinacao{"p1=false, p2=false, p3=false -> Regra determinística (enumerável)", false, false, false,
               classificacao::regra_enumeravel},
};

constexpr std::array casos{
    Caso{"Caso 1", true, false, false},
    Caso{"Caso 2", false, true, false},
    Caso{"Caso 3", false, false, true},
    Caso{"Caso 4", false, false, false},
};

const std::vector<Subtarefa> subtarefas_referencia{
    {"Extrair o que mudou entre versões do protocolo", "Extração/Interpretação", false, false, true},
    {"Classificar o tipo de emenda (administrativa/substancial)", "Decisão de Negócio", true, false, false},
};

std::string_view classificar_tarefa(bool p1, bool p2, bool p3) {
    if (p1) return classificacao::regra_deterministica;
    if (p2) return classificacao::approval_gate;
    if (p3) return classificacao::agente_autonomo;

    return classificacao::regra_enumeravel;
}

std::vector<SubtarefaClassificada> decompor_tarefa_hibrida(const std::vector<Subtarefa>& subtarefas) {
    std::vector<SubtarefaClassificada> resultado;

    std::ranges::transform(subtarefas, std::back_inserter(resultado), [](const Subtarefa& subtarefa) {
        return SubtarefaClassificada{subtarefa, classificar_tarefa(subtarefa.p1, subtarefa.p2, subtarefa.p3)};
    });

    return resultado;
}

void verificar_igual(std::string_view atual, std::string_view esperado) {
    if (atual == esperado) return;

    throw std::runtime_error("Expected values to be strictly equal: '" + std::string{atual} + "' !== '" +
                             std::string{esperado} + "'");
}

class Testes {
public:
    void testar(std::string_view descricao, const std::function<void()>& verificacao) {
        total_ += 1;

        try {
            verificacao();
            std::cout << "  [OK] " << descricao << '\n';
        } catch (const std::exception& erro) {
            falhas_ += 1;
            std::cout << "  [FALHOU] " << descricao << '\n' << "           " << erro.what() << '\n';
        }
    }

    int total() const { return total_; }
    int falhas() const { return falhas_; }

private:
    int total_ = 0;
    int falhas_ = 0;
};

int rodar_testes() {
    Testes testes;

    std::cout << "== Testes: árvore pura (Bloco 1, as 4 combinações do checklist) ==\n";
    for (const auto& [descricao, p1, p2, p3, esperada] : combinacoes)
        testes.testar(descricao, [&] { verificar_igual(classificar_tarefa(p1, p2, p3), esperada); });

    std::cout << "\n== Testes: decomposição de tarefa híbrida (Bloco 2, referência TrialForge) ==\n";

    const auto resultado = decompor_tarefa_hibrida(subtarefas_referencia);

    testes.testar("\"Extrair o que mudou entre versões do protocolo\" -> Agente autônomo, com observabilidade completa",
                  [&] { verificar_igual(resultado[0].classificacao, classificacao::agente_autonomo); });
    testes.testar("\"Classificar o tipo de emenda (administrativa/substancial)\" -> Regra determinística",
                  [&] { verificar_igual(resultado[1].classificacao, classificacao::regra_deterministica); });
    testes.testar("decompor_tarefa_hibrida preserva nome e tipo de cada subtarefa na saída", [&] {
        verificar_igual(resultado[0].nome, subtarefas_referencia[0].nome);
        verificar_igual(resultado[0].tipo, subtarefas_referencia[0].tipo);
        verificar_igual(resultado[1].nome, subtarefas_referencia[1].nome);
        verificar_igual(resultado[1].tipo, subtarefas_referencia[1].tipo);
    });

    std::cout << "\nTotal: " << testes.total() << " teste(s), " << testes.total() - testes.falhas()
              << " passou(passaram), " << testes.falhas() << " falhou(falharam).\n";

    return testes.falhas();
}

void rodar_demo() {
    std::cout << "\n===== Demo: as 4 combinações da árvore pura =====\n";
    for (const auto& [rotulo, p1, p2, p3] : casos)
        std::cout << "  " << rotulo << ": p1=" << p1 << ", p2=" << p2 << ", p3=" << p3 << " -> "
                  << classificar_tarefa(p1, p2, p3) << '\n';

    std::cout << "\n===== Demo: decompondo a tarefa híbrida (referência TrialForge, Emenda de Protocolo) =====\n";
    for (const auto& subtarefa : decompor_tarefa_hibrida(subtarefas_referencia))
        std::cout << "  [" << subtarefa.tipo << "] " << subtarefa.nome << '\n'
                  << "    p1=" << subtarefa.p1 << ", p2=" << subtarefa.p2 << ", p3=" << subtarefa.p3 << " -> "
                  << subtarefa.classificacao << '\n';

    std::cout << "\n  Nota: as outras duas linhas da tabela de referência do checklist (\"Rotear pela\n"
                 "  criticidade\" e \"Regenerar documentos afetados\") misturam regra e gate condicional\n"
                 "  de um jeito que não mapeia limpo pra uma única resposta p1/p2/p3. Ficam de fora\n"
                 "  desta demo e dos testes automatizados por essa razão, não por engano.\n";
}

int main() {
    std::cout << std::boolalpha;

    if (const auto falhas = rodar_testes(); falhas > 0) {
        std::cerr << falhas << " teste(s) falharam. A implementação não bate com a especificação.\n";
        return 1;
    }

    rodar_demo();
}
