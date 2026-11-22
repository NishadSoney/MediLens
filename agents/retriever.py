"""Retriever (MediLens Clinical RAG & Vector Knowledge Agent).

Role: Hybrid Vector Retrieval-Augmented Generation (RAG) Specialist.
- Indexes uploaded medical reports (untruncated raw PDF text + structured tests/meds)
  into a session-scoped dense vector index using local Ollama `nomic-embed-text` (768-dim).
- Queries both:
    1. Curated Clinical Medical Knowledge Base (biomarkers, pharmacology, drug interactions,
       radiology/CT/X-ray & surgical guidelines)
    2. Session Uploaded Report Vector Chunks (long multi-page notes & impressions)
- Combines Dense Semantic Cosine Similarity (72%) + Clinical BM25 Lexical Fusion (28%).
- Supplies grounded, citable clinical evidence to Explainer, Advocate, and PharmAssist.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from core.rag import rag_store
from core.medical_apis import get_pubmed_citations


def index_report_for_rag(
    session_id: str,
    report: Dict[str, Any],
    raw_text: str = "",
) -> Dict[str, Any]:
    """Chunk and embed an uploaded medical report into the session vector store."""
    return rag_store.index_session_report(
        session_id=session_id,
        report=report,
        raw_text=raw_text,
    )


def build_report_clinical_query(report: Optional[Dict[str, Any]]) -> str:
    """Construct a focused clinical search query from abnormal markers and prescribed drugs."""
    if not report:
        return ""
    parts: List[str] = []
    tests = report.get("tests", [])
    abnormal = [t for t in tests if t.get("status") != "normal"]
    for t in abnormal[:6]:
        parts.append(f"{t.get('name', '')} {t.get('status', '')}")
    for m in report.get("medicines", [])[:5]:
        parts.append(str(m.get("name", "")))
    if not parts and tests:
        for t in tests[:4]:
            parts.append(str(t.get("name", "")))
    return " ".join(p.strip() for p in parts if p.strip())


def retrieve_clinical_context(
    query: str,
    report: Optional[Dict[str, Any]] = None,
    session_id: str = "default",
    top_k_kb: int = 3,
    top_k_report: int = 2,
    categories: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Retrieve grounded clinical guidelines & report chunks via Hybrid Vector RAG."""
    enriched_query = (query or "").strip()
    if not enriched_query and report:
        enriched_query = build_report_clinical_query(report)
    elif report and len(enriched_query.split()) <= 6:
        # Lightly augment very short queries (e.g. "explain my results") with flagged markers
        abnormal_names = [
            str(t.get("name", ""))
            for t in report.get("tests", [])
            if t.get("status") != "normal"
        ][:3]
        if abnormal_names and not any(n.lower() in enriched_query.lower() for n in abnormal_names):
            enriched_query = f"{enriched_query} {' '.join(abnormal_names)}"

    if not enriched_query:
        return {
            "query": "",
            "kb_matches": [],
            "report_matches": [],
            "citations": [],
            "context_text": "",
            "provider": rag_store.get_status(session_id).get("embedding_provider", ""),
        }

    result = rag_store.search(
        query=enriched_query,
        session_id=session_id,
        top_k_kb=top_k_kb,
        top_k_report=top_k_report,
        categories=categories,
    )

    citations: List[Dict[str, Any]] = []
    for item in result.get("kb_matches", []):
        citations.append({
            "id": item["id"],
            "title": item["title"],
            "source": item["source"],
            "category": item["category"],
            "score": item["score"],
            "type": "clinical_kb",
        })
    for item in result.get("report_matches", []):
        citations.append({
            "id": item["id"],
            "title": item["title"],
            "source": item["source"],
            "category": item["category"],
            "score": item["score"],
            "type": "report_chunk",
        })

    # Retrieve live peer-reviewed PubMed research citations for clinical queries
    pubmed_items = get_pubmed_citations(enriched_query, max_results=2)
    for p_item in pubmed_items:
        citations.append({
            "id": f"pubmed_{p_item.get('pmid', 'search')}",
            "title": p_item.get("title", "PubMed Biomedical Research"),
            "source": p_item.get("authority", "NCBI PubMed"),
            "category": "peer_reviewed_literature",
            "score": 0.95,
            "url": p_item.get("url", "https://pubmed.ncbi.nlm.nih.gov/"),
            "pmid": p_item.get("pmid", ""),
            "type": "pubmed_live",
        })

    result["citations"] = citations
    result["context_text"] = format_rag_context(result)
    return result


def format_rag_context(retrieval: Dict[str, Any]) -> str:
    """Format retrieved KB guidelines and report chunks into a concise grounded prompt block."""
    kb_matches = retrieval.get("kb_matches", [])
    report_matches = retrieval.get("report_matches", [])
    if not kb_matches and not report_matches:
        return ""

    lines: List[str] = ["[RETRIEVED CLINICAL KNOWLEDGE & DOCUMENT CONTEXT (RAG)]"]

    if kb_matches:
        lines.append("\nGrounded Clinical References:")
        for idx, doc in enumerate(kb_matches, start=1):
            lines.append(
                f"{idx}. {doc['title']} (Source: {doc['source']}, Relevance: {int(doc['score'] * 100)}%)\n"
                f"   {doc['content']}"
            )

    if report_matches:
        lines.append("\nRelevant Excerpts from Uploaded Document:")
        for idx, chunk in enumerate(report_matches, start=1):
            lines.append(
                f"{idx}. [{chunk['title']}] {chunk['content'][:420]}"
            )

    return "\n".join(lines)


def get_rag_status(session_id: str = "default") -> Dict[str, Any]:
    """Return RAG vector store health, embedding model, and index counts."""
    return rag_store.get_status(session_id=session_id)
