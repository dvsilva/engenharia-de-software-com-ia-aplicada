---
name: neural-network-training
description: Small feed-forward classifiers built with TensorFlow.js in Node.js and in the browser, from tensors of normalized, weighted, and one-hot data to dense layers, Adam, cross-entropy, charted training, prediction, and products ranked by predicted score.
---

# Neural network training

## Concept

A neural network learns to map numeric inputs to one category among several. Every input is a vector of numbers: continuous values are normalized to the range from 0 to 1, and each category becomes a one-hot position. The labels are one-hot vectors too. A hidden dense layer with ReLU learns combinations of the inputs, and a softmax output layer turns the final scores into one probability per category. Training repeats over the dataset for a number of epochs while an optimizer (Adam) adjusts the weights to reduce categorical cross-entropy, which measures how far the predicted probabilities are from the right answer. Prediction runs a new vector through the trained network and reads its probabilities.

A yes-or-no question needs a single sigmoid output unit instead, trained with binary cross-entropy, whose output reads as a score from 0 to 1. A recommender asks that question for every pair of a user and a product: the input joins the user's vector to the product's, the label says whether the user bought the product, and the products are ranked by their predicted score for the user. Multiplying each group of features by a weight makes some groups count more than others in those vectors.

## How the course implements it

The first example's starting point builds a dataset of three people, each with seven features (normalized age, three colors, and three cities), plus one plan per person as labels (premium, medium, and basic). It turns both into tensors and prints them.

Its final version trains and predicts with **TensorFlow.js** for **Node.js**. Its sequential model has a dense layer of 80 units with ReLU over the seven inputs and a dense softmax layer with three units. It compiles with the Adam optimizer, categorical cross-entropy, and the accuracy metric, then trains for 100 epochs with shuffling and without logs. Finally, it predicts the plan for a new person and prints the three plans from most to least likely, each followed by its probability as a percentage with two decimals.

The program predicts from the new person's vector exactly as written, which encodes blue and Rio, even though the person object declared just before it, which the program never uses, describes green and Curitiba. A transcription copies the vector, because the vector is what the program predicts from and what its cases check.

The e-commerce example runs **TensorFlow.js** in the browser, inside the page's Web Worker, which imports it from **jsDelivr** (see [browser-app](browser-app.md)). Its starting point only fakes training: the worker reports half the progress and one training log with epoch 1, loss 1, and accuracy 1, then a second later reports full progress and completion, and recommending only logs the user. The page charts each training log in the Treinamento tab of the **tfjs-vis** visor, accuracy as Precisão do Modelo and loss as Erro de Treinamento, opening the visor on load in the starting point and on the first training log in the final version.

The final version builds the recommender in five parts, each a complete copy of the page whose worker goes one step further:

1. It fetches the products and derives the context from them and from the users it trains with: the age and price ranges, an index per color and per category, and each product's average buyer age, normalized, which falls back to the middle of the age range for products nobody bought.
2. It encodes every product as its normalized price, its average buyer age, its category one-hot, and its color one-hot, multiplied by the weights 0.2, 0.1, 0.4, and 0.3.
3. It encodes each user as the mean of their purchases' vectors, or, without purchases, as zeros apart from their normalized age times the age weight, and pairs every user who bought something with every product, labeled by whether that user bought it.
4. It trains a sequential model on those pairs, with dense layers of 128, 64, and 32 units with ReLU and one sigmoid unit, compiled with Adam at a learning rate of 0.01, binary cross-entropy, and the accuracy metric, and fitted for 100 epochs in batches of 32 with shuffling, posting each epoch's loss and accuracy to the page.
5. It recommends by pairing the chosen user's vector with every product's, predicting a score for each pair, and sending the products back from the highest score to the lowest.

The first three parts stop at a debugger statement, which pauses only while developer tools are open, and report completion without training, so they never chart.

## What usually goes wrong in other languages

- In the browser, training runs in a Web Worker so the page stays responsive, and the worker reports progress and one log per epoch by message. **tfjs-vis** charts those logs and exists only in **JavaScript**, so it stays wherever the page stays in **JavaScript**.
- **Pyodide**, which runs **Python** in the browser, ports **NumPy** and **scikit-learn** but not **TensorFlow**, so a **Python** worker writes the small network with **NumPy** or keeps **TensorFlow.js**.
- The e-commerce labels come out as booleans, which **TensorFlow.js** converts on its own, while most libraries need floats of 0 and 1.
- **TensorFlow.js** names the accuracy metric acc in its training logs, while **Keras** names it accuracy.
- A user's purchases are copies of products stored with the user, and two of them have other colors than in the catalog, so the user's vector encodes the stored color. Looking purchases up in the catalog changes the vectors.
- Every implementation starts from random weights and shuffles the data, so the probabilities change on every run, in every language. Exact values are never comparable.
- Dense layers in **TensorFlow** start from Glorot-uniform weights and zero biases. A library with other defaults, such as **candle**, needs the same initialization set explicitly: with its own defaults, basic is not the least likely plan in about one run out of ten.
- **TensorFlow.js** trains asynchronously, which is why the original awaits training and prediction. **Keras** in **Python** is synchronous.
- **TensorFlow.js** creates float tensors from integer lists, while **TensorFlow** in **Python** infers integers unless the type is set to float32.
- In **Python**, printing a tensor the way the original does means using the language's own print, because the **TensorFlow** print function writes to standard error and nothing reaches the program's output.
- **Keras** prints a progress bar during prediction unless verbosity is turned off, which adds output the original never prints.
- Current **Keras** declares the input shape with an input layer instead of an argument on the first dense layer.
- **TensorFlow** publishes packages for a limited range of **Python** versions, usually behind the newest release, so the tested transcription pins the version it passed with.
- With three people and the default batch size, every epoch is a single batch, so a training loop without shuffling learns the same way.
- When a library's cross-entropy takes raw scores and applies softmax internally, prediction has to apply softmax explicitly to get probabilities.
- Recent **candle** releases fail to build on stable **Rust** for Apple Silicon, so the tested transcription pins an older release with its lockfile.

## How close common targets get

| Target                            | Fit               | Library                                                                                 |
| --------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| **Python**                        | Direct equivalent | **TensorFlow** with **Keras**                                                           |
| **JavaScript** and **TypeScript** | Direct equivalent | **TensorFlow.js**                                                                       |
| **Rust**                          | Substitute        | **candle**, with **TensorFlow**'s initialization and AdamW without weight decay as Adam |
| **Go**                            | Substitute        | Plain **Go**, writing the small network directly                                        |
| **C#**                            | Substitute        | **TorchSharp**                                                                          |
| **Java**                          | Substitute        | **DJL**                                                                                 |
| **C++**                           | Substitute        | **LibTorch**                                                                            |

Tested transcriptions of the first example exist for **Python** and **Rust** in its final version, and for **C++** and **Java** in its starting point.

## Tolerance

The first example's predictions are compared by shape, never by value: three lines with each plan exactly once, ordered from most to least likely, with percentages that add up to 100 within 0.1, and basic always last. Across 125 runs of the original, premium and medium traded first place while basic stayed last, and the tested transcriptions kept basic last in every run measured (55 in **Python** and 600 in **Rust**).

The e-commerce recommender never shows its scores, only the order of the products, which changes with every training. Its cases check that each trained user's own purchases fill the top of the list, in any order among them, that the list still holds every product once, and that a product bought by the user without purchases comes first for them after training again. All three held in each of 28 runs of the original.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-00-template (starting point)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-00-z (final version)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-template (starting point, in the browser)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte01-ecommerce-recomendations-with-tensorflow (final version, part 1: the context)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte02-ecommerce-recomendations-with-tensorflow (final version, part 2: product vectors)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte03-ecommerce-recomendations-with-tensorflow (final version, part 3: user vectors and training pairs)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte04-ecommerce-recomendations-with-tensorflow (final version, part 4: training)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte05-ecommerce-recomendations-with-tensorflow (final version, part 5: recommendations)
