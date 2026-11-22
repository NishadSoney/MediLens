"""MediLens FastAPI Backend Server.

Exposes the multi-agent medical report pipeline as a REST API.
Run:  uvicorn api_server:app --reload --port 8000
"""

from __future__ import annotations

import copy
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import backend
from core.llm import MODEL_REGISTRY, check_model_status, DEFAULT_MODEL

app = FastAPI(title="MediLens API", version="2.0.0")

# CORS for React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store (for demo; use Redis/DB in production)
_sessions: Dict[str, Dict[str, Any]] = {}


def _get_or_create_session(session_id: str) -> Dict[str, Any]:
    if session_id not in _sessions:
        _sessions[session_id] = {
            "report": None,
            "history": [],
            "model": DEFAULT_MODEL,
            "language": "English",
        }
    return _sessions[session_id]


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    model: Optional[str] = None
    language: str = "auto"
    report: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    reply: str
    intent: str = "explain"
    model_used: str = "gemini"
    detected_language: str = "English"
    sources: List[Dict[str, Any]] = []


class RagSearchRequest(BaseModel):
    query: str
    session_id: str = "default"
    top_k_kb: int = 4
    top_k_report: int = 3


class ModelInfo(BaseModel):
    id: str
    display_name: str
    provider: str
    icon: str
    color: str
    description: str
    available: bool
    type: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "MediLens API"}


@app.get("/api/models")
def list_models():
    """List all registered models and their availability."""
    status = check_model_status()
    models = []
    for model_id, info in MODEL_REGISTRY.items():
        s = status.get(model_id, {"available": False, "type": "unknown"})
        models.append({
            "id": model_id,
            **info,
            "available": s["available"],
            "type": s["type"],
        })
    return {"models": models, "default": DEFAULT_MODEL}


@app.post("/api/analyze")
async def analyze_report(
    file: Optional[UploadFile] = File(None),
    use_sample: bool = Form(False),
    session_id: str = Form("default"),
    model: Optional[str] = Form(None),
):
    """Upload and analyze a medical report or prescription."""
    session = _get_or_create_session(session_id)
    if model:
        session["model"] = model

    file_path = None
    if file and not use_sample:
        # Save uploaded file to temp
        suffix = Path(file.filename or "report").suffix or ".pdf"
        fd, file_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

    try:
        report = backend.analyze_report(
            file_path,
            use_sample=use_sample,
            model=session.get("model"),
            session_id=session_id,
        )
        session["report"] = report

        # Build response
        tests = report.get("tests", [])
        abnormal = [t for t in tests if t.get("status") != "normal"]
        critical = [t for t in tests if t.get("status") == "critical"]

        intro = f"I've read your report. {len(abnormal)} of {len(tests)} results are outside the usual range."
        if critical:
            intro += f" {critical[0]['name']} is high enough that you should contact your doctor soon."

        session["history"].append({"role": "assistant", "content": intro})

        return {
            "report": report,
            "message": intro,
            "stats": {
                "total": len(tests),
                "abnormal": len(abnormal),
                "critical": len(critical),
            },
        }
    finally:
        # Clean up temp file
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except Exception:
                pass


@app.get("/api/sample")
def sample_report(session_id: str = "default", model: Optional[str] = None):
    """Load the built-in sample report."""
    session = _get_or_create_session(session_id)
    if model:
        session["model"] = model
    report = backend.analyze_report(None, use_sample=True, model=session.get("model"), session_id=session_id)
    session["report"] = report

    tests = report.get("tests", [])
    abnormal = [t for t in tests if t.get("status") != "normal"]
    critical = [t for t in tests if t.get("status") == "critical"]

    intro = f"I've loaded a sample report. {len(abnormal)} of {len(tests)} results are outside the usual range."
    if critical:
        intro += f" {critical[0]['name']} is high enough that you should contact your doctor soon."

    return {
        "report": report,
        "message": intro,
        "stats": {
            "total": len(tests),
            "abnormal": len(abnormal),
            "critical": len(critical),
        },
    }


@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    """Process user queries through the multi-agent pipeline."""
    session = _get_or_create_session(req.session_id)
    if req.report:
        session["report"] = req.report
    report = session.get("report")
    model = req.model or session.get("model", DEFAULT_MODEL)
    lang = req.language or session.get("language", "English")

    # Store user message
    session["history"].append({"role": "user", "content": req.message})

    # Route and respond via backend (auto-detects user's input language + Retriever RAG citations)
    from agents.router import route_query
    intent, detected_lang = route_query(req.message, selected_lang="auto")
    session["language"] = detected_lang
    reply, sources = backend.chat_with_metadata(
        req.message,
        report,
        lang="auto",
        model=model,
        session_id=req.session_id,
    )

    session["history"].append({"role": "assistant", "content": reply, "sources": sources})

    return ChatResponse(
        reply=reply,
        intent=intent,
        model_used=model,
        detected_language=detected_lang,
        sources=sources,
    )


@app.get("/api/rag/status")
def rag_status_endpoint(session_id: str = "default"):
    """Return Retriever Hybrid Vector RAG status, embedding model, and vector counts."""
    return backend.rag_status(session_id=session_id)


@app.post("/api/rag/search")
def rag_search_endpoint(req: RagSearchRequest):
    """Run direct Hybrid Vector RAG semantic search over Clinical KB & uploaded report chunks."""
    session = _get_or_create_session(req.session_id)
    return backend.rag_search(
        query=req.query,
        report=session.get("report"),
        session_id=req.session_id,
        top_k_kb=req.top_k_kb,
        top_k_report=req.top_k_report,
    )


@app.get("/api/doctor-prep")
def doctor_prep_endpoint(session_id: str = "default"):
    """Generate doctor visit preparation data."""
    session = _get_or_create_session(session_id)
    report = session.get("report")
    if not report:
        raise HTTPException(400, "No report loaded. Upload or load sample first.")

    model = session.get("model")
    prep = backend.doctor_prep(report, model=model, session_id=session_id)
    summary = backend.summary_text(report, model=model, session_id=session_id)
    return {"prep": prep, "summary_text": summary}


@app.get("/api/medicines")
def medicines_endpoint(session_id: str = "default"):
    """Get medicine information from the loaded report."""
    session = _get_or_create_session(session_id)
    report = session.get("report")
    if not report:
        raise HTTPException(400, "No report loaded.")

    model = session.get("model")
    meds = backend.medicine_info(report, model=model)
    return {"medicines": meds}


class DetailedSummaryRequest(BaseModel):
    session_id: str = "default"
    model: Optional[str] = None
    language: str = "English"
    report: Optional[Dict[str, Any]] = None


@app.post("/api/detailed-summary")
def detailed_summary_endpoint(req: DetailedSummaryRequest):
    """Generate a comprehensive, plain-language bullet-point summary of the entire report."""
    session = _get_or_create_session(req.session_id)
    if req.report:
        session["report"] = req.report
    report = session.get("report")
    if not report:
        raise HTTPException(400, "No report loaded. Upload a medical report first.")

    model = req.model or session.get("model", DEFAULT_MODEL)
    lang = req.language or session.get("language", "English")
    result = backend.detailed_summary(report, lang=lang, model=model, session_id=req.session_id)
    result["model_used"] = model
    return result


@app.get("/api/summary-download")
def summary_download(session_id: str = "default"):
    """Download the one-page doctor consultation summary as a text file."""
    session = _get_or_create_session(session_id)
    report = session.get("report")
    if not report:
        raise HTTPException(400, "No report loaded.")

    model = session.get("model")
    summary = backend.summary_text(report, model=model)
    fd, path = tempfile.mkstemp(suffix=".txt")
    os.close(fd)
    with open(path, "w", encoding="utf-8") as f:
        f.write(summary)
    return FileResponse(path, media_type="text/plain", filename="medilens_doctor_summary.txt")


@app.post("/api/voice/clear-cache")
def clear_voice_cache_endpoint():
    """Clear cached temporary voice audio files from previous voice conversations."""
    removed = backend.clear_voice_cache()
    return {"cleared": True, "removed_files": removed}


@app.post("/api/speak")
def speak_endpoint(text: str = Form(...), language: str = Form("auto")):
    """Convert full text to natural human speech audio (auto-detects reply language)."""
    audio_path = backend.speak(text, language)
    if audio_path and os.path.exists(audio_path):
        media_type = "audio/wav" if audio_path.endswith(".wav") else "audio/mpeg"
        filename = "reply.wav" if audio_path.endswith(".wav") else "reply.mp3"
        return FileResponse(audio_path, media_type=media_type, filename=filename)
    raise HTTPException(500, "TTS generation failed.")


@app.post("/api/transcribe")
async def transcribe_endpoint(audio: UploadFile = File(...), language: str = Form("auto")):
    """Transcribe uploaded audio file using backend speech recognition."""
    suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        content = await audio.read()
        with open(path, "wb") as f:
            f.write(content)
        text = backend.transcribe(path, language)
        return {"text": text}
    finally:
        if os.path.exists(path):
            try:
                os.unlink(path)
            except Exception:
                pass


@app.get("/api/history")
def get_history(session_id: str = "default"):
    """Get chat history."""
    session = _get_or_create_session(session_id)
    return {"history": session.get("history", [])}


@app.get("/api/medical/search")
def search_medical_authorities(q: str, type: str = "all"):
    """Query verified medical authorities (MedlinePlus, RxNorm, openFDA, PubMed) directly."""
    from core.medical_apis import get_medlineplus_info, get_rxnorm_drug_info, get_fda_drug_warnings, get_pubmed_citations
    
    results: Dict[str, Any] = {}
    if type in ("all", "test", "condition"):
        results["medlineplus"] = get_medlineplus_info(q)
    if type in ("all", "drug", "medicine"):
        results["rxnorm"] = get_rxnorm_drug_info(q)
        results["openfda"] = get_fda_drug_warnings(q)
    if type in ("all", "research", "literature"):
        results["pubmed"] = get_pubmed_citations(q, max_results=3)
    return results


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)
