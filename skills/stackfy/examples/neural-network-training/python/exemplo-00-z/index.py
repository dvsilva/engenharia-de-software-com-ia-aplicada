import tensorflow as tf


def train_model(input_xs, output_ys):
    model = tf.keras.Sequential()

    # Primeira camada da rede:
    # entrada de 7 posições (idade normalizada + 3 cores + 3 localizacoes)

    # 80 neuronios = aqui coloquei tudo isso, pq tem pouca base de treino
    # quanto mais neuronios, mais complexidade a rede pode aprender
    # e consequentemente, mais processamento ela vai usar

    # A ReLU age como um filtro:
    # É como se ela deixasse somente os dados interessantes seguirem viagem na rede
    # Se a informação chegou nesse neuronio é positiva, passa para frente!
    # se for zero ou negativa, pode jogar fora, nao vai servir para nada
    model.add(tf.keras.Input(shape=(7,)))
    model.add(tf.keras.layers.Dense(80, activation="relu"))

    # Saída: 3 neuronios
    # um para cada categoria (premium, medium, basic)

    # activation: softmax normaliza a saida em probabilidades
    model.add(tf.keras.layers.Dense(3, activation="softmax"))

    # Compilando o modelo
    # optimizer Adam ( Adaptive Moment Estimation)
    # é um treinador pessoal moderno para redes neurais:
    # ajusta os pesos de forma eficiente e inteligente
    # aprender com historico de erros e acertos

    # loss: categorical_crossentropy
    # Ele compara o que o modelo "acha" (os scores de cada categoria)
    # com a resposta certa
    # a categoria premium será sempre [1, 0, 0]

    # quanto mais distante da previsão do modelo da resposta correta
    # maior o erro (loss)
    # Exemplo classico: classificação de imagens, recomendação, categorização de
    # usuário
    # qualquer coisa em que a resposta certa é "apenas uma entre várias possíveis"

    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    # Treinamento do modelo
    # verbose: desabilita o log interno (e usa só callback)
    # epochs: quantidade de veses que vai rodar no dataset
    # shuffle: embaralha os dados, para evitar viés
    model.fit(
        input_xs,
        output_ys,
        verbose=0,
        epochs=100,
        shuffle=True,
        callbacks=[
            # tf.keras.callbacks.LambdaCallback(
            #     on_epoch_end=lambda epoch, log: print(
            #         f"Epoch: {epoch}: loss = {log['loss']}"
            #     )
            # )
        ],
    )

    return model


def predict(model, pessoa):
    # transformar a lista Python para o tensor (TensorFlow)
    tf_input = tf.constant(pessoa, dtype=tf.float32)

    # Faz a predição (output será um vetor de 3 probabilidades)
    pred = model.predict(tf_input, verbose=0)
    pred_array = pred.tolist()
    return [{"prob": prob, "index": index} for index, prob in enumerate(pred_array[0])]


# Exemplo de pessoas para treino (cada pessoa com idade, cor e localização)
# pessoas = [
#     {"nome": "Erick", "idade": 30, "cor": "azul", "localizacao": "São Paulo"},
#     {"nome": "Ana", "idade": 25, "cor": "vermelho", "localizacao": "Rio"},
#     {"nome": "Carlos", "idade": 40, "cor": "verde", "localizacao": "Curitiba"},
# ]

# Vetores de entrada com valores já normalizados e one-hot encoded
# Ordem: [idade_normalizada, azul, vermelho, verde, São Paulo, Rio, Curitiba]
# tensor_pessoas = [
#     [0.33, 1, 0, 0, 1, 0, 0],  # Erick
#     [0, 0, 1, 0, 0, 1, 0],  # Ana
#     [1, 0, 0, 1, 0, 0, 1],  # Carlos
# ]

# Usamos apenas os dados numéricos, como a rede neural só entende números.
# tensor_pessoas_normalizado corresponde ao dataset de entrada do modelo.
tensor_pessoas_normalizado = [
    [0.33, 1, 0, 0, 1, 0, 0],  # Erick
    [0, 0, 1, 0, 0, 1, 0],  # Ana
    [1, 0, 0, 1, 0, 0, 1],  # Carlos
]

# Labels das categorias a serem previstas (one-hot encoded)
# [premium, medium, basic]
labels_nomes = ["premium", "medium", "basic"]  # Ordem dos labels
tensor_labels = [
    [1, 0, 0],  # premium - Erick
    [0, 1, 0],  # medium - Ana
    [0, 0, 1],  # basic - Carlos
]

# Criamos tensores de entrada (xs) e saída (ys) para treinar o modelo
input_xs = tf.constant(tensor_pessoas_normalizado, dtype=tf.float32)
output_ys = tf.constant(tensor_labels, dtype=tf.float32)

# quanto mais dado melhor!
# assim o algoritmo consegue entender melhor os padrões complexos
# dos dados
model = train_model(input_xs, output_ys)

pessoa = {"nome": "zé", "idade": 28, "cor": "verde", "localizacao": "Curitiba"}
# Normalizando a idade da nova pessoa usando o mesmo padrão do treino
# Exemplo: idade_min = 25, idade_max = 40, então (28 - 25) / (40 - 25 ) = 0.2

pessoa_tensor_normalizado = [
    [
        0.2,  # idade normalizada
        1,  # cor azul
        0,  # cor vermelho
        0,  # cor verde
        0,  # localização São Paulo
        1,  # localização Rio
        0,  # localização Curitiba
    ]
]

predictions = predict(model, pessoa_tensor_normalizado)
results = "\n".join(
    f"{labels_nomes[p['index']]} ({p['prob'] * 100:.2f}%)"
    for p in sorted(predictions, key=lambda p: p["prob"], reverse=True)
)
print(results)
