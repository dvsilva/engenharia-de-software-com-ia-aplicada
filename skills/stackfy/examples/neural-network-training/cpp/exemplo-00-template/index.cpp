#include <torch/torch.h>

#include <array>
#include <iostream>
#include <string_view>

int main() {
    // Exemplo de pessoas para treino (cada pessoa com idade, cor e localização)
    // pessoas = {
    //     { nome: "Erick", idade: 30, cor: "azul", localizacao: "São Paulo" },
    //     { nome: "Ana", idade: 25, cor: "vermelho", localizacao: "Rio" },
    //     { nome: "Carlos", idade: 40, cor: "verde", localizacao: "Curitiba" }
    // };

    // Vetores de entrada com valores já normalizados e one-hot encoded
    // Ordem: [idade_normalizada, azul, vermelho, verde, São Paulo, Rio, Curitiba]
    // tensor_pessoas = {
    //     {0.33, 1, 0, 0, 1, 0, 0}, // Erick
    //     {0, 0, 1, 0, 0, 1, 0},    // Ana
    //     {1, 0, 0, 1, 0, 0, 1}     // Carlos
    // }

    // Usamos apenas os dados numéricos, como a rede neural só entende números.
    // tensor_pessoas_normalizado corresponde ao dataset de entrada do modelo.
    float tensor_pessoas_normalizado[3][7] = {
        {0.33, 1, 0, 0, 1, 0, 0},  // Erick
        {0, 0, 1, 0, 0, 1, 0},     // Ana
        {1, 0, 0, 1, 0, 0, 1},     // Carlos
    };

    // Labels das categorias a serem previstas (one-hot encoded)
    // [premium, medium, basic]
    [[maybe_unused]] const std::array<std::string_view, 3> labels_nomes = {"premium", "medium", "basic"};  // Ordem dos labels
    float tensor_labels[3][3] = {
        {1, 0, 0},  // premium - Erick
        {0, 1, 0},  // medium - Ana
        {0, 0, 1},  // basic - Carlos
    };

    // Criamos tensores de entrada (xs) e saída (ys) para treinar o modelo
    const auto input_xs = torch::from_blob(tensor_pessoas_normalizado, {3, 7});
    const auto output_ys = torch::from_blob(tensor_labels, {3, 3});

    std::cout << input_xs << std::endl;
    std::cout << output_ys << std::endl;
}
