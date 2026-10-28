from typing import Any

import pymupdf
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import TextSplitterConfig


def span_text(span: dict[str, Any]) -> str:
    return "".join(chr(char[0]) for char in span["chars"])


def span_baseline(span: dict[str, Any]) -> float | None:
    return span["chars"][0][2][1] if span["chars"] else None


def page_text(page: pymupdf.Page) -> str:
    parts: list[str] = []
    last_baseline: float | None = None

    for span in page.get_texttrace():
        baseline = span_baseline(span)
        same_line = last_baseline is None or baseline == last_baseline
        parts.append(span_text(span) if same_line else f"\n{span_text(span)}")
        last_baseline = baseline

    return "".join(parts)


def load_pages(path: str) -> list[Document]:
    with pymupdf.open(path) as pdf:
        return [
            Document(
                page_content=page_text(page),
                metadata={"source": path, "loc": {"pageNumber": page.number + 1}},
            )
            for page in pdf
            if page.get_texttrace()
        ]


class DocumentProcessor:
    def __init__(self, pdf_path: str, text_splitter_config: TextSplitterConfig):
        self.pdf_path = pdf_path
        self.text_splitter_config = text_splitter_config

    def load_and_split(self) -> list[Document]:
        raw_documents = load_pages(self.pdf_path)
        print(f"📄 Loaded {len(raw_documents)} pages from PDF")

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.text_splitter_config.chunk_size,
            chunk_overlap=self.text_splitter_config.chunk_overlap,
        )
        documents = splitter.split_documents(raw_documents)
        print(f"✂️  Split into {len(documents)} chunks")

        return [
            Document(
                page_content=document.page_content,
                metadata={"source": document.metadata["source"]},
            )
            for document in documents
        ]
