use candle_core::{DType, Device, Module, Tensor};
use candle_nn::{loss, ops, AdamW, Init, Linear, Optimizer, ParamsAdamW, VarBuilder, VarMap};

// Inicialização das camadas densas do TensorFlow: Glorot uniforme e bias zerado
fn dense(in_dim: usize, out_dim: usize, vb: VarBuilder) -> candle_core::Result<Linear> {
    let limit = (6.0 / (in_dim + out_dim) as f64).sqrt();
    let weight = vb.get_with_hints(
        (out_dim, in_dim),
        "weight",
        Init::Uniform {
            lo: -limit,
            up: limit,
        },
    )?;
    let bias = vb.get_with_hints(out_dim, "bias", Init::Const(0.0))?;

    Ok(Linear::new(weight, Some(bias)))
}

struct Model {
    hidden: Linear,
    output: Linear,
}

impl Model {
    fn new(vb: VarBuilder) -> candle_core::Result<Self> {
        // Primeira camada da rede:
        // entrada de 7 posições (idade normalizada + 3 cores + 3 localizacoes)

        // 80 neuronios = aqui coloquei tudo isso, pq tem pouca base de treino
        // quanto mais neuronios, mais complexidade a rede pode aprender
        // e consequentemente, mais processamento ela vai usar
        let hidden = dense(7, 80, vb.pp("hidden"))?;

        // Saída: 3 neuronios
        // um para cada categoria (premium, medium, basic)
        let output = dense(80, 3, vb.pp("output"))?;

        Ok(Self { hidden, output })
    }

    fn logits(&self, xs: &Tensor) -> candle_core::Result<Tensor> {
        // A ReLU age como um filtro:
        // É como se ela deixasse somente os dados interessantes seguirem viagem na rede
        // Se a informação chegou nesse neuronio é positiva, passa para frente!
        // se for zero ou negativa, pode jogar fora, nao vai servir para nada
        self.output.forward(&self.hidden.forward(xs)?.relu()?)
    }
}

fn train_model(input_xs: &Tensor, output_ys: &Tensor) -> candle_core::Result<Model> {
    let varmap = VarMap::new();
    let vb = VarBuilder::from_varmap(&varmap, DType::F32, input_xs.device());
    let model = Model::new(vb)?;

    // Compilando o modelo
    // optimizer Adam ( Adaptive Moment Estimation)
    // é um treinador pessoal moderno para redes neurais:
    // ajusta os pesos de forma eficiente e inteligente
    // aprender com historico de erros e acertos
    // (AdamW sem weight decay é o Adam)
    let mut optimizer = AdamW::new(
        varmap.all_vars(),
        ParamsAdamW {
            lr: 0.001,
            weight_decay: 0.0,
            ..Default::default()
        },
    )?;

    // loss: cross_entropy
    // Ele compara o que o modelo "acha" (os scores de cada categoria)
    // com a resposta certa
    // a categoria premium será sempre a de índice 0
    // (aqui ela recebe os scores antes do softmax e aplica o softmax por dentro)

    // quanto mais distante da previsão do modelo da resposta correta
    // maior o erro (loss)
    // Exemplo classico: classificação de imagens, recomendação, categorização de
    // usuário
    // qualquer coisa em que a resposta certa é "apenas uma entre várias possíveis"
    let labels = output_ys.argmax(1)?;

    // Treinamento do modelo
    // epochs: quantidade de veses que vai rodar no dataset
    // com 3 pessoas, cada época é um único lote e embaralhar não altera o treino
    for _epoch in 0..100 {
        let loss = loss::cross_entropy(&model.logits(input_xs)?, &labels)?;
        optimizer.backward_step(&loss)?;
        // println!("Epoch: {_epoch}: loss = {}", loss.to_scalar::<f32>()?);
    }

    Ok(model)
}

fn predict(model: &Model, pessoa: &Tensor) -> candle_core::Result<Vec<(f32, usize)>> {
    // Faz a predição (output será um vetor de 3 probabilidades)
    // activation: softmax normaliza a saida em probabilidades
    let pred = ops::softmax(&model.logits(pessoa)?, 1)?;
    let pred_array = pred.to_vec2::<f32>()?;

    Ok(pred_array[0]
        .iter()
        .enumerate()
        .map(|(index, prob)| (*prob, index))
        .collect())
}

fn main() -> candle_core::Result<()> {
    // Exemplo de pessoas para treino (cada pessoa com idade, cor e localização)
    // pessoas = [
    //     { nome: "Erick", idade: 30, cor: "azul", localizacao: "São Paulo" },
    //     { nome: "Ana", idade: 25, cor: "vermelho", localizacao: "Rio" },
    //     { nome: "Carlos", idade: 40, cor: "verde", localizacao: "Curitiba" }
    // ];

    // Vetores de entrada com valores já normalizados e one-hot encoded
    // Ordem: [idade_normalizada, azul, vermelho, verde, São Paulo, Rio, Curitiba]
    // tensor_pessoas = [
    //     [0.33, 1, 0, 0, 1, 0, 0], // Erick
    //     [0, 0, 1, 0, 0, 1, 0],    // Ana
    //     [1, 0, 0, 1, 0, 0, 1]     // Carlos
    // ]

    // Usamos apenas os dados numéricos, como a rede neural só entende números.
    // tensor_pessoas_normalizado corresponde ao dataset de entrada do modelo.
    let tensor_pessoas_normalizado: [[f32; 7]; 3] = [
        [0.33, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0], // Erick
        [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0],  // Ana
        [1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0],  // Carlos
    ];

    // Labels das categorias a serem previstas (one-hot encoded)
    // [premium, medium, basic]
    let labels_nomes = ["premium", "medium", "basic"]; // Ordem dos labels
    let tensor_labels: [[f32; 3]; 3] = [
        [1.0, 0.0, 0.0], // premium - Erick
        [0.0, 1.0, 0.0], // medium - Ana
        [0.0, 0.0, 1.0], // basic - Carlos
    ];

    // Criamos tensores de entrada (xs) e saída (ys) para treinar o modelo
    let device = Device::Cpu;
    let input_xs = Tensor::new(&tensor_pessoas_normalizado, &device)?;
    let output_ys = Tensor::new(&tensor_labels, &device)?;

    // quanto mais dado melhor!
    // assim o algoritmo consegue entender melhor os padrões complexos
    // dos dados
    let model = train_model(&input_xs, &output_ys)?;

    // pessoa = { nome: "zé", idade: 28, cor: "verde", localizacao: "Curitiba" }
    // Normalizando a idade da nova pessoa usando o mesmo padrão do treino
    // Exemplo: idade_min = 25, idade_max = 40, então (28 - 25) / (40 - 25 ) = 0.2

    let pessoa_tensor_normalizado: [[f32; 7]; 1] = [[
        0.2, // idade normalizada
        1.0, // cor azul
        0.0, // cor vermelho
        0.0, // cor verde
        0.0, // localização São Paulo
        1.0, // localização Rio
        0.0, // localização Curitiba
    ]];

    let mut predictions = predict(&model, &Tensor::new(&pessoa_tensor_normalizado, &device)?)?;
    predictions.sort_by(|a, b| b.0.total_cmp(&a.0));
    let results = predictions
        .iter()
        .map(|(prob, index)| format!("{} ({:.2}%)", labels_nomes[*index], prob * 100.0))
        .collect::<Vec<_>>()
        .join("\n");
    println!("{results}");

    Ok(())
}
