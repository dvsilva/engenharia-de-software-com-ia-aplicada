---
name: object-detection
description: Pretrained YOLOv5n object detection with TensorFlow.js in a Web Worker, from game frames resized and normalized into tensors to boxes, scores, and classes filtered by label and confidence and turned into the point the game is shot at.
---

# Object detection

## Concept

An object detector finds things in an image and says where they are. A pretrained model, trained once on a large labeled dataset, is loaded and used as it is, without training. Each frame becomes a tensor in the size and range the model expects, the model returns candidate detections, each with a box, a confidence score, and a class index into the model's labels, and the program keeps the detections of the class it cares about whose score clears a threshold. Boxes come normalized to the input, so the program scales them back to the frame's pixels and takes each box's center as the point to act on. Detecting in real time means sampling frames on an interval and running inference away from the thread that draws them.

## How the course implements it

The lesson takes an open source Duck Hunt game and makes it play itself (see [browser-app](browser-app.md) for the page). The machine learning folder hides the crosshair, adds a HUD at the top right of the game with a score and the last prediction, and starts a Web Worker. Every 200 ms it extracts the game's stage as a canvas, turns it into an ImageBitmap, and transfers it to the worker. For each prediction the worker posts back, the page logs `🎯 AI predicted at: (x, y)` with the coordinates as they came, shows `Score: <score>` and `Predictions: (<x>, <y>)` rounded to integers in the HUD, moves the crosshair to the point, shows it, and calls the game's click handler at the crosshair's position, which fires a shot there.

The worker loads the latest **TensorFlow.js** from **jsDelivr** as a classic script and logs `🧠 YOLOv5n Web Worker initialized`. The model is YOLOv5n trained on the 80 COCO classes, converted to a **TensorFlow.js** graph model with class-agnostic non-maximum suppression inside, so it takes one 640 by 640 RGB image as a [1, 640, 640, 3] tensor from 0 to 1 and returns up to 100 boxes as normalized [x1, y1, x2, y2], their scores, their class indices, and the number of valid detections, in that order. webpack copies the model and its labels into the served folder.

1. The starting point answers every frame at once with the point (400, 400) and a score of 0, without loading anything.
2. Part 1 loads the labels and the model, warms the model up with a tensor of ones in the input's shape, and posts that it loaded, a message the page ignores. It converts each frame with fromPixels, resizes it bilinearly to 640 by 640, divides it by 255, adds the batch dimension inside tidy, runs inference, and reads the first three outputs before a debugger statement. It still answers every frame with (400, 400) and a score of 0, so the game behaves as in the starting point, except that predictions start only once the model has loaded.
3. Part 2 keeps every detection whose score is at least 0.4 and whose label is kite, which is what Duck Hunt's ducks look like to a COCO model. It scales the box by the frame's width and height and posts the box's center, with the score as a percentage string with two decimals, one message per detection.

## What usually goes wrong in other languages

- Only **TensorFlow.js** loads the graph model as it is. Other runtimes need the YOLOv5n weights in their own format, such as an ONNX or TorchScript export, or the same graph converted back to a SavedModel with **tfjs-graph-converter**. An export without non-maximum suppression returns raw predictions, 25,200 rows of 85 values for a 640 by 640 input, which need decoding and suppression by hand before they match these outputs.
- The frame is the game's stage in its own coordinates, 800 by 600 whatever the window's size, and the point goes back to the crosshair as a position inside the stage. A transcription that captures the screen or the canvas instead gets window pixels, which only match the game's coordinates when the window is 800 by 600.
- The frame is stretched to a square, not letterboxed, while **ultralytics** letterboxes and returns boxes already in the original image's pixels. Scaling those boxes again by the frame's size moves every shot.
- The model expects RGB from 0 to 1. Pixels from 0 to 255 or in BGR, the order **OpenCV** reads, still produce boxes, just wrong ones, so the mistake goes unnoticed until the shots miss.
- Kite is class 33 of COCO's labels, which every COCO model keeps in the same order. A model trained on other labels has no kite and needs another class or its own training.
- The worker answers each detection with its own message, so a frame with two ducks moves the crosshair and fires twice. The score travels as a string, which the HUD shows as it is.
- The page sends a frame every 200 ms without waiting for the previous answer, so slow inference queues frames and the shots aim where the ducks were. Frames that reach part 1 or part 2 before the model loads are dropped.
- **TensorFlow.js** frees GPU memory only when tensors are disposed, which is what tidy and dispose do, while runtimes in other languages free it on their own.
- **Pyodide** has no **TensorFlow** or **ONNX Runtime**, so detection in **Python** runs outside the browser, in a local server the page sends its frames to.

## How close common targets get

The game itself stays in **JavaScript** in every target, as [browser-app](browser-app.md) explains, and only the code that plays it moves.

| Target                            | Fit               | Library                                                                                                                            |
| --------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **JavaScript** and **TypeScript** | Direct equivalent | **TensorFlow.js** with the same graph model, in a Web Worker                                                                       |
| **Python**                        | Substitute        | A local server with **TensorFlow** running the graph converted by **tfjs-graph-converter**, or **ultralytics** with its own YOLOv5 |
| **Rust**                          | Substitute        | **candle** compiled to WebAssembly, with its YOLOv8 example's COCO weights                                                         |
| **Go**                            | Substitute        | A local server with **onnxruntime_go** and a YOLOv5n ONNX export                                                                   |
| **C#**                            | Substitute        | A local server with **ONNX Runtime** and a YOLOv5n ONNX export                                                                     |
| **Java**                          | Substitute        | A local server with **DJL** and a YOLOv5n ONNX export                                                                              |
| **C++**                           | Substitute        | A local server with **OpenCV**'s DNN module and a YOLOv5n ONNX export                                                              |

No tested transcription exists yet.

## Tolerance

The starting point and part 1 always predict (400, 400) with a score of 0, so the cases compare that exactly, and they accept a median interval from 150 to 300 ms between predictions for the 200 ms sampling. Shooting at that one point lost the first level in each of 44 runs. A lost first level scores at most half its points, which the game rates Yikes., and the next shot lands on Play Again?, which reloads the page.

Part 2's detections follow ducks that fly at random, so the cases check their shape: every logged point is a pair of numbers, the points vary, the HUD shows a score of at least 40 with two decimals and integer coordinates, and the game reaches level 2 without reloading. The original reached level 2 in 39 of 40 runs, shooting five or six of the first level's six ducks in each run inspected, and the one exception came while three games ran at once.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/_template (starting point: a fixed prediction)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/DuckHunt-JS-parte01 (part 1: the model and inference)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/DuckHunt-JS-parte02 (part 2: the ducks it detects)
