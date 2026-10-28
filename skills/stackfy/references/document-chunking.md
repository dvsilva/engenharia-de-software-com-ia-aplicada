---
name: document-chunking
description: Loading a PDF as one text per page and splitting each page into overlapping chunks small enough to embed, as the course does with LangChain's PDFLoader over pdf-parse and its RecursiveCharacterTextSplitter.
---

# Document chunking

## Concept

A document is searched by meaning in pieces, because a whole document embeds into one blurred vector and embedding models truncate long input ([text-embeddings](text-embeddings.md)). A PDF holds positioned text items rather than running text, so a loader rebuilds each page's text from them, starting a new line whenever the vertical position changes. A recursive character splitter then cuts each page at the coarsest separator that keeps pieces under a size limit, paragraphs first, then lines, then words, then single characters, and merges the pieces back into chunks up to that limit. Each chunk repeats up to an overlap's worth of the end of the one before it, so an idea cut at a boundary survives whole in one of them. The chunks keep metadata such as their source and go to a vector store ([vector-store](vector-store.md)).

## How the course implements it

The embeddings lesson of module 1 indexes tensores.pdf, seven pages in Portuguese about tensors in **TensorFlow.js**. The template configures the PDF's path and a splitter with chunks of 1000 characters and an overlap of 200, and declares **pdf-parse** 1.1 without importing it. The final version loads the PDF with **@langchain/community** 0.3's PDFLoader, which reads it through the build of pdf.js 1.10 that **pdf-parse** ships. It makes one document per page that has text, joins the items of a line without a separator, starts each new vertical position on a new line, and records the page number under loc. **langchain** 0.3's RecursiveCharacterTextSplitter, which arrives through **@langchain/community** rather than the lesson's own dependencies, splits each page on a blank line, a newline, a space, and finally between characters, keeps each separator at the start of the piece after it, and trims every chunk, turning the seven pages into 15 chunks of 208 to 997 characters. Each chunk keeps only the source path as metadata, and the program prints how many pages it loaded and how many chunks it made.

## What usually goes wrong in other languages

- pdf.js rebuilds a page from its text runs in the order the page draws them, with nothing between runs on the same baseline and a newline whenever the baseline changes. Libraries that analyze the layout rebuild it their own way: on the lesson's PDF, **pypdf** puts every word on a line of its own, while **PyMuPDF**'s get_text and **pdfminer.six** match pdf.js on 5 and 4 of the 7 pages once whitespace is collapsed, and on none exactly. **PyMuPDF**'s get_texttrace lists the runs in drawing order with their baselines, and joining them by pdf.js's rule rebuilds all seven pages exactly, as the tested transcription does. Other text means other chunks, other vectors, and other search results.
- Given the same page text, **langchain-text-splitters**' RecursiveCharacterTextSplitter produces the same 15 chunks in **Python**, so only the loader needs care there. Elsewhere the splitter is written by hand with the same separators in the same order, the same merge with overlap, separators kept at the start of the next piece, and trimmed chunks.
- The limit counts characters, never tokens. **JavaScript** counts UTF-16 code units and **Python** code points, which agree on the lesson's PDF.
- Each page is split on its own, so no chunk spans two pages.

## How close common targets get

| Target                            | Fit               | Library                                                                                                               |
| --------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Python**                        | Substitute        | **PyMuPDF**'s get_texttrace joined by pdf.js's rule, and **langchain-text-splitters**' RecursiveCharacterTextSplitter |
| **JavaScript** and **TypeScript** | Direct equivalent | **@langchain/community**'s PDFLoader over **pdf-parse**, and **langchain**'s RecursiveCharacterTextSplitter           |
| **Java**                          | Substitute        | **Apache PDFBox** for the pages and a recursive splitter written by hand                                              |
| **Go**                            | Substitute        | **langchaingo**'s PDF loader and RecursiveCharacter splitter                                                          |
| **Rust**                          | Substitute        | **pdf-extract** for the pages and a recursive splitter written by hand                                                |
| **C#**                            | Substitute        | **PdfPig** for the pages and a recursive splitter written by hand                                                     |
| **C++**                           | Substitute        | **Poppler**'s C++ interface for the pages and a recursive splitter written by hand                                    |

The tested **Python** transcription of the final version sits with the vector-store examples.

## Tolerance

The template loads nothing, so its case compares nothing from the PDF. The final version's cases compare the chunks exactly: how many pages and chunks the program reports, the first 200 characters of every chunk a search returns, and the length of each chunk stored in **Neo4j**. The RAG lesson's cases also compare whole chunks, inside the context of the prompt each question sends ([retrieval-augmented-generation](retrieval-augmented-generation.md)).

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j-template (configured, never loaded)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-13-embeddings-neo4j-rag
