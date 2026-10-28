import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Neo4jConfig:
    url: str
    username: str
    password: str
    index_name: str
    search_type: str
    text_node_properties: list[str]
    node_label: str
    embedding_node_property: str


@dataclass(frozen=True)
class OpenRouterConfig:
    nlp_model: str | None
    url: str
    api_key: str | None
    temperature: float
    max_retries: int
    default_headers: dict[str, str | None]


@dataclass(frozen=True)
class PdfConfig:
    path: str


@dataclass(frozen=True)
class TextSplitterConfig:
    chunk_size: int
    chunk_overlap: int


@dataclass(frozen=True)
class EmbeddingConfig:
    model_name: str
    onnx_file: str


@dataclass(frozen=True)
class SimilarityConfig:
    top_k: int


@dataclass(frozen=True)
class Config:
    neo4j: Neo4jConfig
    open_router: OpenRouterConfig
    pdf: PdfConfig
    text_splitter: TextSplitterConfig
    embedding: EmbeddingConfig
    similarity: SimilarityConfig


CONFIG = Config(
    neo4j=Neo4jConfig(
        url=os.environ["NEO4J_URI"],
        username=os.environ["NEO4J_USER"],
        password=os.environ["NEO4J_PASSWORD"],
        index_name="tensors_index",
        search_type="vector",
        text_node_properties=["text"],
        node_label="Chunk",
        embedding_node_property="embedding",
    ),
    open_router=OpenRouterConfig(
        nlp_model=os.environ.get("NLP_MODEL"),
        url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY"),
        temperature=0.3,
        max_retries=2,
        default_headers={
            "HTTP-Referer": os.environ.get("OPENROUTER_SITE_URL"),
            "X-Title": os.environ.get("OPENROUTER_SITE_NAME"),
        },
    ),
    pdf=PdfConfig(path="./tensores.pdf"),
    text_splitter=TextSplitterConfig(chunk_size=1000, chunk_overlap=200),
    embedding=EmbeddingConfig(
        model_name=os.environ["EMBEDDING_MODEL"],
        onnx_file="onnx/model.onnx",
    ),
    similarity=SimilarityConfig(top_k=3),
)
