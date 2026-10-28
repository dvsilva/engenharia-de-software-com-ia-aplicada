import re

from langchain_core.documents import Document


def format_content(content: str, max_length: int = 200) -> str:
    cleaned = re.sub(r"\s+", " ", content).strip()

    return f"{cleaned[:max_length]}..." if len(cleaned) > max_length else cleaned


def display_results(results: list[Document]) -> None:
    print(f"\n📄 Encontrados {len(results)} trechos relevantes:\n")

    for index, document in enumerate(results):
        print(f"   {index + 1}.")
        print(f"      {format_content(document.page_content)}")
        if document.metadata.get("pageNumber"):
            print(f"      📄 (Página: {document.metadata['pageNumber']})")
        print()
