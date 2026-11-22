"""Backend service connecting multi-agent + Hybrid Vector RAG pipeline to the MediLens UI.

Orchestrates the 7 Named Sub-Agents & Clinical Engines:
1. Parser (PyMuPDF / Multimodal Vision)
2. Extractor (Structured JSON Extraction Agent)
3. Flagger (Rule-based Python Flagger Engine + reference_ranges.json)
4. Retriever (Hybrid Vector RAG Agent — nomic-embed-text 768-dim + Clinical BM25 Dual Index)
5. Triage (Intent, Language & Emergency Safety Agent)
6. Explainer (RAG-Grounded Plain-language Explanations & 6-Section Detailed Bullet Summary)
7. Advocate (RAG-Grounded Doctor Consultation Coach & Appointment Checklist Agent)
8. PharmAssist (RAG-Grounded Prescription Drug Intelligence & Timing Agent)
9. Finalize step (Disclaimers, RAG citations & critical value alerts)
10. Voice (Dual-engine STT & TTS)
"""

from __future__ import annotations

import copy
import os
import tempfile
from typing import Any, Dict, List, Optional, Tuple

from agents.doctor_prep import generate_doctor_prep, generate_summary_document
from agents.explainer import (
    explain_query,
    explain_query_with_rag,
    generate_overall_summary,
    generate_detailed_bullet_summary,
)
from agents.extractor import extract_report_data
from agents.medicine_info import get_medicines_info
from agents.retriever import (
    index_report_for_rag,
    retrieve_clinical_context,
    get_rag_status,
)
from agents.router import route_query, detect_tts_lang_code
from core.flagger import flag_report
from core.llm import generate_text, _is_provider_cooled_down, _mark_provider_down

# Track temporary TTS audio files created in this process so old voice cache can be cleaned up
_TTS_TEMP_FILES: List[str] = []


def clear_voice_cache() -> int:
    """Delete cached temporary TTS audio files from previous voice turns."""
    removed = 0
    while _TTS_TEMP_FILES:
        path = _TTS_TEMP_FILES.pop()
        if path and os.path.exists(path):
            try:
                os.unlink(path)
                removed += 1
            except Exception:
                pass
    return removed

# (speech-recognition language code, gTTS language code)
LANGUAGES = {
    "English": ("en-IN", "en"),
    "हिन्दी": ("hi-IN", "hi"),
    "मराठी": ("mr-IN", "mr"),
}

# Standard sample data used when clicking "Try sample report"
_SAMPLE = {
    "meta": {
        "lab": "City Diagnostics (Sample Report)",
        "date": "12 Nov 2026",
        "patient": "Age 54 · Male",
    },
    "tests": [
        {"name": "HbA1c", "value": "8.2", "unit": "%", "range": "4.0 – 5.6", "status": "high",
         "explain": "Shows your average blood sugar over about 3 months. This is above the usual range."},
        {"name": "Fasting glucose", "value": "162", "unit": "mg/dL", "range": "70 – 99", "status": "high",
         "explain": "Your sugar after a night without food is higher than the usual range."},
        {"name": "Potassium", "value": "6.6", "unit": "mmol/L", "range": "3.5 – 5.1", "status": "critical",
         "explain": "Potassium is well above the safe range. This needs a doctor's attention soon."},
        {"name": "LDL cholesterol", "value": "148", "unit": "mg/dL", "range": "< 100", "status": "high",
         "explain": "Often called 'bad' cholesterol. Higher values add strain on the heart over time."},
        {"name": "Triglycerides", "value": "190", "unit": "mg/dL", "range": "< 150", "status": "high",
         "explain": "A type of blood fat, higher here than the usual range."},
        {"name": "Vitamin D", "value": "18", "unit": "ng/mL", "range": "30 – 100", "status": "low",
         "explain": "Below the usual range. Vitamin D supports bones, muscles, and immunity."},
        {"name": "Haemoglobin", "value": "13.8", "unit": "g/dL", "range": "13.0 – 17.0", "status": "normal", "explain": ""},
        {"name": "Creatinine", "value": "1.0", "unit": "mg/dL", "range": "0.7 – 1.3", "status": "normal", "explain": ""},
        {"name": "HDL cholesterol", "value": "44", "unit": "mg/dL", "range": "> 40", "status": "normal", "explain": ""},
        {"name": "TSH", "value": "2.4", "unit": "mIU/L", "range": "0.4 – 4.0", "status": "normal", "explain": ""},
    ],
    "summary": (
        "Most of your results are normal. Your blood sugar markers, cholesterol and vitamin D are "
        "outside the usual range, and your potassium is high enough that you should contact your "
        "doctor soon. Bring this report to your next visit."
    ),
    "medicines": [
        {"name": "Metformin 500 mg", "purpose": "Helps the body use insulin better and lowers blood sugar.",
         "side_effects": "Upset stomach or loose motions, especially at the start.",
         "timing": "As printed: twice a day after meals."},
        {"name": "Atorvastatin 10 mg", "purpose": "Lowers cholesterol.",
         "side_effects": "Muscle aches in some people.",
         "timing": "As printed: once a day at night."},
        {"name": "Vitamin D3 60,000 IU", "purpose": "Replaces low vitamin D.",
         "side_effects": "Usually well tolerated at the prescribed dose.",
         "timing": "As printed: once a week."},
    ],
}


def analyze_report(
    path: Optional[str],
    use_sample: bool = False,
    model: Optional[str] = None,
    session_id: str = "default",
) -> Dict[str, Any]:
    """Parse document -> Extractor -> Flagger -> Retriever (Vector Index) -> PharmAssist -> Explainer."""
    if use_sample or not path:
        report = copy.deepcopy(_SAMPLE)
        report["tests"] = flag_report(report["tests"])
        rag_info = index_report_for_rag(session_id=session_id, report=report, raw_text=report.get("summary", ""))
        report["rag_meta"] = rag_info
        return report

    # 1. Extractor Agent parses file into raw structured data (+ full untruncated raw_text)
    raw_data = extract_report_data(file_path=path, model=model)
    raw_text = raw_data.pop("_raw_text", "")

    # If extraction found no tests on an explicit file upload, never silently replace with a different patient's sample report!
    if not raw_data.get("tests"):
        if not use_sample and path:
            meta = raw_data.get("meta", {"lab": "Uploaded Document", "date": "Recent", "patient": "Patient"})
            report = {
                "meta": meta,
                "tests": [],
                "medicines": [],
                "summary": "We processed this document but could not identify structured diagnostic parameters. Please ensure your report is clear and legible.",
            }
            rag_info = index_report_for_rag(session_id=session_id, report=report, raw_text=raw_text or report.get("summary", ""))
            report["rag_meta"] = rag_info
            return report
        else:
            report = copy.deepcopy(_SAMPLE)
            report["tests"] = flag_report(report["tests"])
            rag_info = index_report_for_rag(session_id=session_id, report=report, raw_text=raw_text or report.get("summary", ""))
            report["rag_meta"] = rag_info
            return report

    # 2. Rule-based Flagger marks ranges, critical thresholds, and sorts abnormal first
    flagged_tests = flag_report(raw_data.get("tests", []))

    # 3. PharmAssist Agent enriches any medicines found (with RAG pharmacology grounding)
    medicines = get_medicines_info(raw_data, model=model)

    report = {
        "meta": raw_data.get("meta", {
            "lab": "Diagnostic Center",
            "date": "Recent",
            "patient": "Patient"
        }),
        "tests": flagged_tests,
        "medicines": medicines,
    }

    # 4. Explainer Agent generates concise 2-3 sentence overall summary first (avoids Ollama VRAM swap)
    report["summary"] = generate_overall_summary(report, lang="English", model=model, session_id=session_id)

    # 5. Retriever Agent indexes full untruncated report text into the session Vector Store in background
    #    so the dashboard renders immediately while RAG chunks finish embedding (~0.8s)
    import threading
    report_snapshot = copy.deepcopy(report)
    threading.Thread(
        target=index_report_for_rag,
        kwargs={"session_id": session_id, "report": report_snapshot, "raw_text": raw_text},
        daemon=True,
    ).start()
    report["rag_meta"] = {"session_id": session_id, "status": "indexing_background"}

    return report


def chat_with_metadata(
    message: str,
    report: Optional[Dict[str, Any]] = None,
    lang: str = "auto",
    model: Optional[str] = None,
    session_id: str = "default",
) -> Tuple[str, List[Dict[str, Any]]]:
    """Processes user queries through Triage -> Retriever (RAG) -> Specialized Sub-Agents -> Finalize step.

    Automatically mirrors whatever language the user writes or speaks in.

    Returns:
        (reply_text, rag_citations)
    """
    # 1. Route Query, Detect Emergency & Auto-Detect Input Language
    intent, detected_lang = route_query(message, selected_lang=lang)
    effective_lang = detected_lang or "auto"

    if intent == "emergency":
        if effective_lang == "Hindi":
            return (
                "⚠️ यह गंभीर प्रतीत हो रहा है। कृपया तुरंत अपनी स्थानीय आपातकालीन सेवा (112 या एम्बुलेंस) "
                "को कॉल करें या नजदीकी अस्पताल के आपातकालीन विभाग में जाएं। रिपोर्ट या अपॉइंटमेंट का इंतजार न करें।",
                [],
            )
        elif effective_lang == "Marathi":
            return (
                "⚠️ हे गंभीर वाटत आहे. कृपया त्वरित आपल्या स्थानिक आपत्कालीन सेवेशी (112) संपर्क साधा "
                "किंवा जवळच्या रुग्णालयामध्ये जा. अहवालाची किंवा भेटीची वाट पाहू नका.",
                [],
            )
        elif effective_lang == "English":
            return (
                "⚠️ That sounds serious. Please call emergency services (112 or local emergency) or go to the nearest "
                "hospital emergency department immediately. Do not wait for an appointment or lab report explanation.",
                [],
            )
        else:
            # Translate urgent emergency advisory into the user's exact input language
            em_reply = generate_text(
                prompt=(
                    f"Translate this urgent medical emergency alert into the exact same language and script as '{message}' "
                    f"(detected language: {effective_lang}). Output ONLY the translated alert:\n\n"
                    "⚠️ That sounds serious. Please call emergency services (112 / 911 or local emergency) or go to the nearest "
                    "hospital emergency department immediately. Do not wait for an appointment or lab report explanation."
                ),
                model=model,
            )
            return (
                em_reply.strip()
                if em_reply
                else "⚠️ That sounds serious. Please call emergency services (112 / 911) or go to the nearest hospital emergency department immediately.",
                [],
            )

    # If no report context exists and the user is asking general questions, answer directly with Clinical KB RAG
    if not report or (not report.get("tests") and not report.get("medicines")):
        return explain_query_with_rag(message, report, lang=effective_lang, model=model, session_id=session_id)

    # 2. Handle by Specialized Agents (all backed by Retriever RAG & auto-language mirroring)
    reply = ""
    citations: List[Dict[str, Any]] = []
    if intent == "doctor_prep":
        if effective_lang in ("English", "Hindi", "Marathi"):
            prep = doctor_prep(report, lang=effective_lang, model=model, session_id=session_id)
            rag_res = retrieve_clinical_context(query=message, report=report, session_id=session_id, top_k_kb=2, top_k_report=1)
            citations = rag_res.get("citations", [])
            qs = "\n".join(f"• {q}" for q in prep.get("questions", [])[:3])
            if effective_lang == "Hindi":
                reply = (
                    f"मैंने आपके डॉक्टर से पूछने के लिए सवाल तैयार किए हैं। आप 'Doctor prep' टैब में पूरी सूची देख सकते हैं:\n\n{qs}"
                )
            elif effective_lang == "Marathi":
                reply = (
                    f"मी आपल्या डॉक्टरांना विचारण्यासाठी प्रश्न तयार केले आहेत. आपण 'Doctor prep' टॅबमध्ये संपूर्ण यादी पाहू शकता:\n\n{qs}"
                )
            else:
                reply = (
                    f"I have prepared key questions for your doctor in the Doctor prep tab. Here are some of them:\n\n{qs}\n\n"
                    "Visit the Doctor prep tab to download the full one-page consultation summary."
                )
        else:
            # Mirror any other user input language naturally via RAG-grounded Explainer
            reply, citations = explain_query_with_rag(
                message, report, lang=effective_lang, model=model, session_id=session_id
            )

    elif intent == "medicine":
        # Answer directly via RAG-grounded Explainer so it always replies richly in the user's exact input language
        reply, citations = explain_query_with_rag(
            message, report, lang=effective_lang, model=model, session_id=session_id
        )

    else:
        # Default: Explainer Agent grounded by Retriever RAG (mirrors exact user input language)
        reply, citations = explain_query_with_rag(
            message, report, lang=effective_lang, model=model, session_id=session_id
        )

    # 3. Finalize Step: Critical-value reminder + Medical disclaimer (matched to user's language)
    critical_tests = [t for t in (report or {}).get("tests", []) if t.get("status") == "critical"]
    critical_note = ""
    if critical_tests:
        crit_names = ", ".join(t.get("name") for t in critical_tests)
        if effective_lang == "Hindi":
            critical_note = f"\n\n🔔 महत्वपूर्ण सूचना: आपके {crit_names} का स्तर असामान्य है, कृपया जल्द ही डॉक्टर से परामर्श लें।"
        elif effective_lang == "Marathi":
            critical_note = f"\n\n🔔 महत्त्वाची सूचना: आपल्या {crit_names} चे प्रमाण चिंताजनक मर्यादेत आहे, कृपया लवकरच डॉक्टरांशी संपर्क साधा."
        elif effective_lang == "English":
            critical_note = f"\n\n🔔 Important note: {crit_names} is outside the safe range. Please consult your physician promptly."

    disclaimer = ""
    if effective_lang == "Hindi":
        disclaimer = "\n\n*यह केवल सामान्य स्वास्थ्य जानकारी है, कोई चिकित्सीय निदान नहीं। कृपया अपने डॉक्टर से परामर्श लें।*"
    elif effective_lang == "Marathi":
        disclaimer = "\n\n*ही केवळ सामान्य आरोग्य माहिती आहे, वैद्यकीय निदान नाही. कृपया आपल्या डॉक्टरांचा सल्ला घ्या.*"
    elif effective_lang == "English":
        disclaimer = "\n\n*General health information only. Not a medical diagnosis. Consult your doctor.*"

    return f"{reply}{critical_note}{disclaimer}", citations


def chat(
    message: str,
    report: Optional[Dict[str, Any]] = None,
    lang: str = "auto",
    model: Optional[str] = None,
    session_id: str = "default",
) -> str:
    """Backward-compatible wrapper returning only the text reply."""
    reply, _ = chat_with_metadata(message, report=report, lang=lang, model=model, session_id=session_id)
    return reply


def doctor_prep(
    report: Dict[str, Any],
    lang: str = "English",
    model: Optional[str] = None,
    session_id: str = "default",
) -> Dict[str, Any]:
    """Advocate Agent (RAG-Grounded Doctor Visit Preparation)."""
    return generate_doctor_prep(report, lang=lang, model=model, session_id=session_id)


def medicine_info(report: Dict[str, Any], model: Optional[str] = None) -> List[Dict[str, str]]:
    """PharmAssist Agent (RAG-Grounded Prescription Drug Intelligence)."""
    return get_medicines_info(report, model=model)


def summary_text(report: Dict[str, Any], model: Optional[str] = None, session_id: str = "default") -> str:
    """Generates the downloadable one-page doctor consultation summary document (Advocate Agent)."""
    prep = doctor_prep(report, model=model, session_id=session_id)
    return generate_summary_document(report, prep)


def detailed_summary(
    report: Dict[str, Any],
    lang: str = "English",
    model: Optional[str] = None,
    session_id: str = "default",
) -> Dict[str, Any]:
    """Generates a detailed, RAG-grounded plain-language bullet-point summary of the entire report (Explainer Agent)."""
    return generate_detailed_bullet_summary(report, lang=lang, model=model, session_id=session_id)


def rag_status(session_id: str = "default") -> Dict[str, Any]:
    """Return Retriever RAG engine status & vector index telemetry."""
    return get_rag_status(session_id=session_id)


def rag_search(
    query: str,
    report: Optional[Dict[str, Any]] = None,
    session_id: str = "default",
    top_k_kb: int = 4,
    top_k_report: int = 3,
) -> Dict[str, Any]:
    """Run direct semantic Hybrid Vector RAG search via Retriever Agent."""
    return retrieve_clinical_context(
        query=query,
        report=report,
        session_id=session_id,
        top_k_kb=top_k_kb,
        top_k_report=top_k_report,
    )


# ----------------------------------------------------------------------------
# Voice STT & TTS
# ----------------------------------------------------------------------------
def transcribe(audio_path: str, lang: str = "auto") -> str:
    """Speech-to-text for recorded voice input with multi-engine fallback (auto-detects language)."""
    # 1. Try Groq Whisper (ultra-fast, auto-detects 99+ languages) if key available
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if groq_key and not groq_key.startswith("your_"):
        try:
            import requests
            with open(audio_path, "rb") as f:
                files = {"file": ("audio.wav", f, "audio/wav")}
                data = {"model": "whisper-large-v3-turbo"}
                r = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    files=files,
                    data=data,
                    headers={"Authorization": f"Bearer {groq_key}"},
                    timeout=15,
                )
                if r.ok:
                    text = r.json().get("text", "").strip()
                    if text:
                        return text
        except Exception as e:
            print(f"Groq Whisper transcription error: {e}")

    # 2. Try SpeechRecognition (Google STT)
    try:
        import speech_recognition as sr
        recognizer = sr.Recognizer()
        with sr.AudioFile(audio_path) as source:
            audio = recognizer.record(source)
        lang_code = LANGUAGES.get(lang, ("en-IN", "en"))[0]
        text = recognizer.recognize_google(audio, language=lang_code).strip()
        if text:
            return text
    except Exception as e:
        print(f"SpeechRecognition error: {e}")

    return ""


# Warm, human-sounding Microsoft Neural voice mapping per language code (used by edge-tts)
_NEURAL_VOICES = {
    "en": "en-US-AvaNeural",
    "hi": "hi-IN-SwaraNeural",
    "mr": "mr-IN-AarohiNeural",
    "ta": "ta-IN-PallaviNeural",
    "te": "te-IN-ShrutiNeural",
    "kn": "kn-IN-SapnaNeural",
    "ml": "ml-IN-SobhanaNeural",
    "bn": "bn-IN-TanishaaNeural",
    "gu": "gu-IN-DhwaniNeural",
    "pa": "pa-IN-OjasNeural",
    "ur": "ur-PK-UzmaNeural",
    "ar": "ar-SA-ZariyahNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "pt": "pt-BR-FranciscaNeural",
    "it": "it-IT-ElsaNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "zh-CN": "zh-CN-XiaoxiaoNeural",
}


def _clean_text_for_speech(text: str) -> str:
    """Clean markdown & symbols into natural spoken prose WITHOUT truncating sentences."""
    import re
    cleaned = text or ""
    cleaned = re.sub(r"[#*`_~🔔⚠️]", " ", cleaned)
    cleaned = re.sub(r"^\s*[•\-]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\bmg/dL\b", "milligrams per deciliter", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bmmol/L\b", "millimoles per liter", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bg/dL\b", "grams per deciliter", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bng/mL\b", "nanograms per milliliter", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bmIU/L\b", "milli-international units per liter", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"([^\.\!\?\।\。\n])\n+", r"\1. ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def speak(text: str, lang: str = "auto") -> Optional[str]:
    """Text-to-speech for voice replies — reads the ENTIRE message with the best human neural voice available.

    Priority:
      1. Microsoft Neural Voice via `edge-tts` (if installed)
      2. Groq Neural Voice (`playai-tts`, Celeste-PlayAI) for English when GROQ_API_KEY is active
      3. Full-text warm `gTTS` (never truncates sentences)
    """
    clean_text = _clean_text_for_speech(text)
    if not clean_text:
        return None

    lang_code = detect_tts_lang_code(clean_text, hint_lang=lang)

    # Clear older cached TTS temp files (keep only most recent 2 to avoid stale voice buildup)
    while len(_TTS_TEMP_FILES) > 2:
        old_path = _TTS_TEMP_FILES.pop(0)
        if old_path and os.path.exists(old_path):
            try:
                os.unlink(old_path)
            except Exception:
                pass

    # 1. Try edge-tts (Studio-quality Microsoft Neural Voices) if installed
    try:
        import asyncio
        import edge_tts

        voice = _NEURAL_VOICES.get(lang_code, "en-US-AvaNeural")
        fd, path = tempfile.mkstemp(prefix="medilens_tts_", suffix=".mp3")
        os.close(fd)

        async def _run_edge():
            comm = edge_tts.Communicate(clean_text, voice=voice, rate="+6%")
            await comm.save(path)

        asyncio.run(_run_edge())
        if os.path.exists(path) and os.path.getsize(path) > 512:
            _TTS_TEMP_FILES.append(path)
            return path
    except Exception:
        pass

    # 2. Try Groq Neural TTS (fast 2.5s timeout + circuit breaker so it never stalls)
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if (
        lang_code == "en"
        and groq_key
        and not groq_key.startswith("your_")
        and not _is_provider_cooled_down("groq_tts")
        and len(clean_text) <= 4000
    ):
        try:
            import requests
            r = requests.post(
                "https://api.groq.com/openai/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "playai-tts",
                    "voice": "Celeste-PlayAI",
                    "input": clean_text,
                    "response_format": "wav",
                },
                timeout=(2, 3),
            )
            if r.ok and len(r.content) > 1024:
                fd, path = tempfile.mkstemp(prefix="medilens_tts_", suffix=".wav")
                os.close(fd)
                with open(path, "wb") as f:
                    f.write(r.content)
                _TTS_TEMP_FILES.append(path)
                return path
            if r.status_code in (400, 401, 403, 404):
                _mark_provider_down("groq_tts", seconds=300.0)
        except Exception:
            _mark_provider_down("groq_tts", seconds=120.0)

    # 3. Full-text gTTS fallback (reads the ENTIRE text with warmer TLD for English)
    try:
        from gtts import gTTS

        fd, path = tempfile.mkstemp(prefix="medilens_tts_", suffix=".mp3")
        os.close(fd)
        try:
            if lang_code == "en":
                gTTS(text=clean_text, lang="en", tld="com.au", slow=False).save(path)
            else:
                gTTS(text=clean_text, lang=lang_code, slow=False).save(path)
        except Exception:
            gTTS(text=clean_text, lang="en", slow=False).save(path)
        _TTS_TEMP_FILES.append(path)
        return path
    except Exception:
        return None
