import sys
from uuid import uuid1

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_neo4j import Neo4jGraph, Neo4jVector

from config import CONFIG
from document_processor import DocumentProcessor
from util import display_results

QUESTIONS = [
    "O que são tensores e como são representados em JavaScript?",
    "Como converter objetos JavaScript em tensores?",
    "O que é normalização de dados e por que é necessária?",
    "Como funciona uma rede neural no TensorFlow.js?",
    "O que significa treinar uma rede neural?",
    "o que é hot enconding e quando usar?",
]


class Neo4j514Vector(Neo4jVector):
    def create_new_index(self) -> None:
        self.query(
            "CALL db.index.vector.createNodeIndex("
            "$name, $label, $property, toInteger($dimensions), 'cosine')",
            params={
                "name": self.index_name,
                "label": self.node_label,
                "property": self.embedding_node_property,
                "dimensions": self.embedding_dimension,
            },
        )


def clear_all(vector_store: Neo4jVector, node_label: str) -> None:
    print("🗑️  Removendo todos os documentos existentes...")
    vector_store.query(f"MATCH (n:`{node_label}`) DETACH DELETE n")
    print("✅ Documentos removidos com sucesso\n")


def create_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(
        model_name=CONFIG.embedding.model_name,
        model_kwargs={
            "backend": "onnx",
            "model_kwargs": {
                "file_name": CONFIG.embedding.onnx_file,
                "provider": "CPUExecutionProvider",
            },
        },
        encode_kwargs={"normalize_embeddings": True},
    )


def connect() -> Neo4jGraph:
    return Neo4jGraph(
        url=CONFIG.neo4j.url,
        username=CONFIG.neo4j.username,
        password=CONFIG.neo4j.password,
        refresh_schema=False,
    )


def create_vector_store(
    embeddings: HuggingFaceEmbeddings, graph: Neo4jGraph
) -> Neo4jVector:
    return Neo4j514Vector.from_existing_graph(
        embeddings,
        graph=graph,
        index_name=CONFIG.neo4j.index_name,
        node_label=CONFIG.neo4j.node_label,
        text_node_properties=CONFIG.neo4j.text_node_properties,
        embedding_node_property=CONFIG.neo4j.embedding_node_property,
    )


def main() -> None:
    graph: Neo4jGraph | None = None

    try:
        print("🚀 Inicializando sistema de Embeddings com Neo4j...\n")

        documents = DocumentProcessor(
            CONFIG.pdf.path, CONFIG.text_splitter
        ).load_and_split()
        graph = connect()
        vector_store = create_vector_store(create_embeddings(), graph)

        clear_all(vector_store, CONFIG.neo4j.node_label)
        for index, document in enumerate(documents):
            print(f"✅ Adicionando documento {index + 1}/{len(documents)}")
            vector_store.add_documents([document], ids=[str(uuid1())])
        print("\n✅ Base de dados populada com sucesso!\n")

        print("🔍 ETAPA 2: Executando buscas por similaridade...\n")
        for question in QUESTIONS:
            print(f"\n{'=' * 80}")
            print(f"📌 PERGUNTA: {question}")
            print("=" * 80)

            results = vector_store.similarity_search(
                question, k=CONFIG.similarity.top_k
            )
            display_results(results)

        print(f"\n{'=' * 80}")
        print("✅ Processamento concluído com sucesso!\n")
    except Exception as error:
        print("error", error, file=sys.stderr)
    finally:
        if graph is not None:
            graph.close()


main()
