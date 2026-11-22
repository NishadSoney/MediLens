"""MediLens Hybrid Vector RAG Engine (core/rag.py).

Implements a privacy-first, local-first Dual-Index Hybrid Vector Retrieval engine:
  1. Collection A — Curated Clinical Knowledge Base (data/clinical_knowledge_base.json)
     Persistent disk-cached vector index (data/vector_store/kb_vectors.npz + kb_meta.json).
  2. Collection B — Dynamic Session Report Index
     Chunks & vectorizes the full uploaded PDF/report text + structured test/Rx records
     per session so multi-page radiology, operative, and lab notes are semantically searchable.

Embedding Provider Priority:
  1. Local Ollama Neural Embeddings (`nomic-embed-text`, 768-dim, 100% offline/private)
  2. Google Gemini Embeddings (`text-embedding-004`, fallback if Ollama is unavailable)
  3. Zero-Failure Lexical TF-IDF Cosine Vector Space (always available offline)

Scoring Algorithm:
  - Hybrid Reciprocal Fusion: 0.72 * Dense Cosine Similarity + 0.28 * BM25/TF-IDF Lexical Score
  - Ensures both semantic conceptual matches ("blood fat" -> Triglycerides/LDL) and exact
    clinical symbol matches ("HbA1c", "eGFR", "Anti-TPO", "Spironolactone").
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import threading
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import requests
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration & Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
KB_JSON_PATH = BASE_DIR / "data" / "clinical_knowledge_base.json"
VECTOR_STORE_DIR = BASE_DIR / "data" / "vector_store"
KB_VECTORS_PATH = VECTOR_STORE_DIR / "kb_vectors.npz"
KB_META_PATH = VECTOR_STORE_DIR / "kb_meta.json"

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
GEMINI_EMBED_MODEL = os.environ.get("GEMINI_EMBED_MODEL", "text-embedding-004")

_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "have", "has", "had", "not", "but", "what", "when", "where", "which", "who",
    "why", "how", "can", "could", "should", "would", "may", "might", "into",
    "about", "your", "their", "they", "them", "its", "also", "more", "most",
    "some", "such", "than", "then", "there", "these", "those", "very", "will",
    "been", "being", "does", "did", "doing", "please", "tell", "explain", "mean",
    "means", "show", "shows", "report", "level", "levels", "value", "values",
}


# ---------------------------------------------------------------------------
# Text Tokenization, Chunking & Lexical BM25/TF-IDF Scoring
# ---------------------------------------------------------------------------
def tokenize_clinical(text: str) -> List[str]:
    """Tokenize medical text while preserving hyphens/acronyms (e.g., hbA1c, nt-probnp, anti-tpo, b12)."""
    tokens = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9\-\+\.]{1,}", (text or "").lower())
    return [t.strip(".-+") for t in tokens if len(t.strip(".-+")) >= 2 and t not in _STOPWORDS]


def chunk_text(text: str, chunk_size: int = 480, overlap: int = 90) -> List[str]:
    """Split raw clinical report text into overlapping semantic chunks respecting paragraph/line boundaries."""
    cleaned = re.sub(r"\r\n?", "\n", (text or "").strip())
    if not cleaned:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", cleaned) if p.strip()]
    chunks: List[str] = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) + 1 <= chunk_size:
            current = f"{current}\n{para}".strip()
        else:
            if current:
                chunks.append(current)
            if len(para) <= chunk_size:
                tail = current[-overlap:] if current and overlap > 0 else ""
                current = f"{tail}\n{para}".strip() if tail else para
            else:
                # Split long paragraph by sentences or sliding window
                start = 0
                while start < len(para):
                    end = min(len(para), start + chunk_size)
                    piece = para[start:end].strip()
                    if piece:
                        chunks.append(piece)
                    if end >= len(para):
                        break
                    start = max(0, end - overlap)
                current = ""

    if current:
        chunks.append(current)

    return chunks


def _compute_bm25_scores(query: str, docs_tokens: List[List[str]]) -> np.ndarray:
    """Compute normalized BM25 lexical relevance scores in [0, 1]."""
    n_docs = len(docs_tokens)
    if n_docs == 0:
        return np.zeros(0, dtype=np.float32)

    q_tokens = tokenize_clinical(query)
    if not q_tokens:
        return np.zeros(n_docs, dtype=np.float32)

    df: Counter = Counter()
    doc_lens = np.array([len(t) for t in docs_tokens], dtype=np.float32)
    avgdl = float(np.mean(doc_lens)) if np.mean(doc_lens) > 0 else 1.0

    for toks in docs_tokens:
        for unique_tok in set(toks):
            df[unique_tok] += 1

    k1, b = 1.5, 0.75
    scores = np.zeros(n_docs, dtype=np.float32)

    for i, toks in enumerate(docs_tokens):
        if not toks:
            continue
        tf = Counter(toks)
        dl = len(toks)
        s = 0.0
        for qt in q_tokens:
            if qt in tf:
                freq = tf[qt]
                idf = math.log(1.0 + (n_docs - df[qt] + 0.5) / (df[qt] + 0.5))
                denom = freq + k1 * (1.0 - b + b * (dl / avgdl))
                s += idf * (freq * (k1 + 1.0)) / max(denom, 1e-6)
        scores[i] = s

    max_s = float(np.max(scores)) if n_docs > 0 else 0.0
    if max_s > 0:
        scores = scores / max_s
    return scores


# ---------------------------------------------------------------------------
# Embedding Providers (Ollama nomic-embed-text -> Gemini -> None/Lexical)
# ---------------------------------------------------------------------------
def _embed_via_ollama(texts: List[str], model: str = OLLAMA_EMBED_MODEL) -> Optional[np.ndarray]:
    """Generate L2-normalized dense embeddings via local Ollama (/api/embed or /api/embeddings)."""
    if not texts:
        return None
    proxies = {"http": None, "https": None}

    # Try modern batch endpoint /api/embed first
    try:
        r = requests.post(
            f"{OLLAMA_BASE_URL}/api/embed",
            json={"model": model, "input": texts},
            timeout=45,
            proxies=proxies,
        )
        if r.ok:
            data = r.json()
            embs = data.get("embeddings")
            if isinstance(embs, list) and len(embs) == len(texts) and len(embs[0]) > 0:
                mat = np.asarray(embs, dtype=np.float32)
                norms = np.linalg.norm(mat, axis=1, keepdims=True)
                norms[norms == 0] = 1.0
                return mat / norms
    except Exception:
        pass

    # Fallback to legacy single-prompt endpoint /api/embeddings
    try:
        vectors = []
        for t in texts:
            r = requests.post(
                f"{OLLAMA_BASE_URL}/api/embeddings",
                json={"model": model, "prompt": t},
                timeout=20,
                proxies=proxies,
            )
            if not r.ok:
                return None
            vec = r.json().get("embedding")
            if not vec:
                return None
            vectors.append(vec)
        mat = np.asarray(vectors, dtype=np.float32)
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return mat / norms
    except Exception:
        return None


def _embed_via_gemini(texts: List[str]) -> Optional[np.ndarray]:
    """Generate L2-normalized embeddings via Google Gemini Embedding API."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key or api_key.startswith("your_") or not texts:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_EMBED_MODEL}:embedContent?key={api_key}"
    vectors = []
    try:
        for t in texts:
            payload = {"content": {"parts": [{"text": t[:2000]}]}}
            r = requests.post(url, json=payload, timeout=15)
            if not r.ok:
                return None
            vec = r.json().get("embedding", {}).get("values")
            if not vec:
                return None
            vectors.append(vec)
        mat = np.asarray(vectors, dtype=np.float32)
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return mat / norms
    except Exception:
        return None


def embed_texts(texts: List[str]) -> Tuple[Optional[np.ndarray], str]:
    """Embed a list of texts using best available local/cloud dense embedder.

    Returns:
        (normalized_matrix_or_None, provider_label)
    """
    mat = _embed_via_ollama(texts)
    if mat is not None:
        return mat, f"ollama:{OLLAMA_EMBED_MODEL}"

    mat = _embed_via_gemini(texts)
    if mat is not None:
        return mat, f"gemini:{GEMINI_EMBED_MODEL}"

    return None, "lexical:bm25-tfidf"


# ---------------------------------------------------------------------------
# Dual-Index Hybrid Vector Store
# ---------------------------------------------------------------------------
class ClinicalRAGStore:
    """Thread-safe Hybrid Vector RAG store for MediLens."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._kb_docs: List[Dict[str, Any]] = []
        self._kb_tokens: List[List[str]] = []
        self._kb_vectors: Optional[np.ndarray] = None
        self._embed_provider: str = "uninitialized"
        self._vector_dim: int = 0
        self._initialized: bool = False

        # Per-session dynamic report vector stores:
        # session_id -> {"docs": [...], "tokens": [...], "vectors": np.ndarray|None, "provider": str}
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def _compute_kb_hash(self, raw_bytes: bytes) -> str:
        return hashlib.sha256(raw_bytes).hexdigest()[:16]

    def ensure_initialized(self) -> None:
        """Lazily load & vectorize the Clinical Knowledge Base (using disk cache when valid)."""
        if self._initialized:
            return

        with self._lock:
            if self._initialized:
                return

            if not KB_JSON_PATH.exists():
                self._kb_docs = []
                self._kb_tokens = []
                self._kb_vectors = None
                self._embed_provider = "lexical:bm25-tfidf"
                self._initialized = True
                return

            raw_bytes = KB_JSON_PATH.read_bytes()
            kb_hash = self._compute_kb_hash(raw_bytes)
            self._kb_docs = json.loads(raw_bytes.decode("utf-8"))

            searchable_texts = []
            for d in self._kb_docs:
                kw = " ".join(d.get("keywords", []))
                searchable_texts.append(
                    f"{d.get('title', '')}. Category: {d.get('category', '')}. "
                    f"Keywords: {kw}. {d.get('content', '')}"
                )
            self._kb_tokens = [tokenize_clinical(t) for t in searchable_texts]

            # Try loading cached vectors from disk
            if KB_VECTORS_PATH.exists() and KB_META_PATH.exists():
                try:
                    meta = json.loads(KB_META_PATH.read_text(encoding="utf-8"))
                    if (
                        meta.get("kb_hash") == kb_hash
                        and meta.get("doc_count") == len(self._kb_docs)
                    ):
                        npz = np.load(KB_VECTORS_PATH)
                        vecs = npz["vectors"]
                        if vecs.shape[0] == len(self._kb_docs):
                            self._kb_vectors = vecs.astype(np.float32)
                            self._vector_dim = int(vecs.shape[1])
                            self._embed_provider = meta.get("provider", f"ollama:{OLLAMA_EMBED_MODEL}")
                            self._initialized = True
                            return
                except Exception as e:
                    print(f"[RAG] Cache miss/reload: {e}")

            # Build fresh dense vector index
            vecs, provider = embed_texts(searchable_texts)
            self._embed_provider = provider
            if vecs is not None:
                self._kb_vectors = vecs
                self._vector_dim = int(vecs.shape[1])
                try:
                    VECTOR_STORE_DIR.mkdir(parents=True, exist_ok=True)
                    np.savez_compressed(KB_VECTORS_PATH, vectors=vecs)
                    KB_META_PATH.write_text(
                        json.dumps(
                            {
                                "kb_hash": kb_hash,
                                "doc_count": len(self._kb_docs),
                                "vector_dim": self._vector_dim,
                                "provider": provider,
                            },
                            indent=2,
                        ),
                        encoding="utf-8",
                    )
                except Exception as e:
                    print(f"[RAG] Warning: could not persist vector cache: {e}")
            else:
                self._kb_vectors = None
                self._vector_dim = 0

            self._initialized = True

    def index_session_report(
        self,
        session_id: str,
        report: Dict[str, Any],
        raw_text: str = "",
    ) -> Dict[str, Any]:
        """Chunk and vectorize an uploaded medical report (raw text + structured items) for a session."""
        self.ensure_initialized()

        docs: List[Dict[str, Any]] = []
        meta = report.get("meta", {})
        report_label = meta.get("lab") or "Uploaded Medical Report"

        # 1. Chunk full untruncated raw PDF / document text
        if raw_text and raw_text.strip():
            for idx, piece in enumerate(chunk_text(raw_text, chunk_size=480, overlap=90), start=1):
                docs.append({
                    "id": f"report_raw_{idx}",
                    "title": f"Uploaded Report Excerpt #{idx}",
                    "category": "report_chunk",
                    "source": report_label,
                    "content": piece,
                })

        # 2. Index structured test results (grouped into compact semantic chunks)
        tests = report.get("tests", [])
        if tests:
            batch_size = 5
            for i in range(0, len(tests), batch_size):
                batch = tests[i : i + batch_size]
                lines = []
                names = []
                for t in batch:
                    nm = t.get("name", "Parameter")
                    names.append(nm)
                    lines.append(
                        f"{nm}: {t.get('value', '')} {t.get('unit', '')} "
                        f"(Ref: {t.get('range', 'N/A')}, Status: {str(t.get('status', 'normal')).upper()}). "
                        f"{t.get('explain', '')}"
                    )
                docs.append({
                    "id": f"report_tests_{i // batch_size + 1}",
                    "title": f"Lab Parameters: {', '.join(names[:3])}" + ("..." if len(names) > 3 else ""),
                    "category": "report_test",
                    "source": report_label,
                    "content": " | ".join(lines),
                })

        # 3. Index prescribed medications
        meds = report.get("medicines", [])
        if meds:
            for idx, m in enumerate(meds, start=1):
                docs.append({
                    "id": f"report_med_{idx}",
                    "title": f"Prescription: {m.get('name', 'Medication')}",
                    "category": "report_medicine",
                    "source": report_label,
                    "content": (
                        f"Medication {m.get('name', '')}: Purpose: {m.get('purpose', 'N/A')}. "
                        f"Side effects: {m.get('side_effects', 'N/A')}. Timing: {m.get('timing', 'N/A')}."
                    ),
                })

        if not docs:
            return {"session_id": session_id, "indexed_chunks": 0, "provider": self._embed_provider}

        texts = [f"{d['title']}. {d['content']}" for d in docs]
        tokens = [tokenize_clinical(t) for t in texts]
        vectors, provider = embed_texts(texts)

        with self._lock:
            self._sessions[session_id] = {
                "docs": docs,
                "tokens": tokens,
                "vectors": vectors,
                "provider": provider,
                "report_label": report_label,
            }

        return {
            "session_id": session_id,
            "indexed_chunks": len(docs),
            "vector_dim": int(vectors.shape[1]) if vectors is not None else 0,
            "provider": provider,
        }

    def _hybrid_search(
        self,
        query: str,
        docs: List[Dict[str, Any]],
        docs_tokens: List[List[str]],
        doc_vectors: Optional[np.ndarray],
        query_vec: Optional[np.ndarray],
        top_k: int = 3,
        min_score: float = 0.18,
        categories: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Execute hybrid Dense Cosine + BM25 search over a collection."""
        if not docs:
            return []

        bm25_scores = _compute_bm25_scores(query, docs_tokens)

        use_dense = (
            doc_vectors is not None
            and query_vec is not None
            and doc_vectors.shape[1] == query_vec.shape[0]
        )

        if use_dense:
            dense_raw = np.dot(doc_vectors, query_vec)
            # Map cosine [-1, 1] -> [0, 1] clipped at 0 for positive semantic match
            dense_scores = np.clip(dense_raw, 0.0, 1.0)
            combined = 0.72 * dense_scores + 0.28 * bm25_scores
        else:
            combined = bm25_scores

        ranked_indices = np.argsort(combined)[::-1]
        results: List[Dict[str, Any]] = []
        for idx in ranked_indices:
            idx_int = int(idx)
            doc = docs[idx_int]
            if categories and doc.get("category") not in categories:
                continue
            score = float(combined[idx_int])
            if score < min_score:
                continue
            results.append({
                "id": doc.get("id", f"doc_{idx_int}"),
                "title": doc.get("title", "Clinical Reference"),
                "category": doc.get("category", "clinical"),
                "source": doc.get("source", "MediLens Clinical KB"),
                "content": doc.get("content", ""),
                "score": round(score, 3),
                "mode": "hybrid_dense_bm25" if use_dense else "bm25_lexical",
            })
            if len(results) >= top_k:
                break

        return results

    def search(
        self,
        query: str,
        session_id: str = "default",
        top_k_kb: int = 3,
        top_k_report: int = 2,
        categories: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Search both the Curated Clinical KB and the Session Uploaded Report Index."""
        self.ensure_initialized()

        # Embed query once if dense vectors exist
        query_vec: Optional[np.ndarray] = None
        if self._kb_vectors is not None:
            q_mat, _ = embed_texts([query])
            if q_mat is not None and q_mat.shape[0] == 1:
                query_vec = q_mat[0]

        kb_hits = self._hybrid_search(
            query=query,
            docs=self._kb_docs,
            docs_tokens=self._kb_tokens,
            doc_vectors=self._kb_vectors,
            query_vec=query_vec,
            top_k=top_k_kb,
            min_score=0.28 if query_vec is not None else 0.15,
            categories=categories,
        )

        report_hits: List[Dict[str, Any]] = []
        with self._lock:
            sess = self._sessions.get(session_id)
        if sess and top_k_report > 0:
            report_hits = self._hybrid_search(
                query=query,
                docs=sess["docs"],
                docs_tokens=sess["tokens"],
                doc_vectors=sess["vectors"],
                query_vec=query_vec,
                top_k=top_k_report,
                min_score=0.25 if query_vec is not None else 0.12,
            )

        return {
            "query": query,
            "kb_matches": kb_hits,
            "report_matches": report_hits,
            "provider": self._embed_provider,
            "vector_dim": self._vector_dim,
            "retrieval_mode": "hybrid_dense_bm25" if query_vec is not None else "bm25_lexical",
        }

    def get_status(self, session_id: str = "default") -> Dict[str, Any]:
        """Return diagnostic telemetry for the MediLens RAG Engine."""
        self.ensure_initialized()
        with self._lock:
            sess = self._sessions.get(session_id)
            session_chunks = len(sess["docs"]) if sess else 0
            total_sessions = len(self._sessions)

        return {
            "enabled": True,
            "agent_name": "Retriever",
            "embedding_provider": self._embed_provider,
            "embedding_model": OLLAMA_EMBED_MODEL if "ollama" in self._embed_provider else self._embed_provider,
            "vector_dimensions": self._vector_dim,
            "scoring_algorithm": "Hybrid (72% Dense Cosine + 28% Clinical BM25)" if self._vector_dim > 0 else "Clinical BM25 Lexical",
            "knowledge_base_docs": len(self._kb_docs),
            "session_report_chunks": session_chunks,
            "active_indexed_sessions": total_sessions,
            "disk_cache_active": KB_VECTORS_PATH.exists(),
        }


# Singleton global store
rag_store = ClinicalRAGStore()
