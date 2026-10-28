# Embeddings with Neo4j

Indexes tensores.pdf in **Neo4j** and searches it by meaning in **Python**, with **PyMuPDF** for the pages, **langchain-text-splitters** for the chunks, **langchain-huggingface** running the lesson's ONNX export of all-MiniLM-L6-v2 through **sentence-transformers**, and **langchain-neo4j**'s Neo4jVector for the store.

## Requirements

- **Python** 3.13
- **Neo4j** 5.14, as the lesson's compose file starts it with npm run infra:up

## Setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
mypy
```

## Running

```bash
NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2 python src/index.py
```

The first run downloads the model from the **Hugging Face** hub. The program replaces every Chunk node with the PDF's 15 chunks and prints the three closest to each of six questions, as the original does.
