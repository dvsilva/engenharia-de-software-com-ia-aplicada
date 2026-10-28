import ai.djl.ndarray.NDArray;
import ai.djl.ndarray.NDManager;

import java.util.List;

public class Index {
    public static void main(String[] args) {
        // Exemplo de pessoas para treino (cada pessoa com idade, cor e localização)
        // pessoas = List.of(
        //     new Pessoa("Erick", 30, "azul", "São Paulo"),
        //     new Pessoa("Ana", 25, "vermelho", "Rio"),
        //     new Pessoa("Carlos", 40, "verde", "Curitiba")
        // );

        // Vetores de entrada com valores já normalizados e one-hot encoded
        // Ordem: [idade_normalizada, azul, vermelho, verde, São Paulo, Rio, Curitiba]
        // tensorPessoas = {
        //     {0.33, 1, 0, 0, 1, 0, 0}, // Erick
        //     {0, 0, 1, 0, 0, 1, 0},    // Ana
        //     {1, 0, 0, 1, 0, 0, 1}     // Carlos
        // }

        // Usamos apenas os dados numéricos, como a rede neural só entende números.
        // tensorPessoasNormalizado corresponde ao dataset de entrada do modelo.
        float[][] tensorPessoasNormalizado = {
            {0.33f, 1, 0, 0, 1, 0, 0}, // Erick
            {0, 0, 1, 0, 0, 1, 0},     // Ana
            {1, 0, 0, 1, 0, 0, 1}      // Carlos
        };

        // Labels das categorias a serem previstas (one-hot encoded)
        // [premium, medium, basic]
        List<String> labelsNomes = List.of("premium", "medium", "basic"); // Ordem dos labels
        float[][] tensorLabels = {
            {1, 0, 0}, // premium - Erick
            {0, 1, 0}, // medium - Ana
            {0, 0, 1}  // basic - Carlos
        };

        try (NDManager manager = NDManager.newBaseManager()) {
            // Criamos tensores de entrada (xs) e saída (ys) para treinar o modelo
            NDArray inputXs = manager.create(tensorPessoasNormalizado);
            NDArray outputYs = manager.create(tensorLabels);

            System.out.println(inputXs);
            System.out.println(outputYs);
        }
    }
}
