"""Triage (MediLens Intent & Emergency Router Agent).

Role: Understands user intent, detects input language automatically, and enforces emergency safety.
- Detects emergency/urgent symptoms across languages and triggers immediate escalation.
- Classifies queries into: 'explain', 'doctor_prep', 'medicine'.
- Automatically detects ANY input language/script so MediLens always replies in the user's language.
"""

from __future__ import annotations

import json
import re
from typing import Tuple

from core.llm import generate_text

EMERGENCY_KEYWORDS = (
    "chest pain", "can't breathe", "cannot breathe", "breathless", "shortness of breath",
    "fainted", "unconscious", "severe pain", "heart attack", "stroke", "bleeding heavily",
    "छाती में दर्द", "सीने में दर्द", "सांस नहीं आ रही", "बेहोश", "दिल का दौरा",
    "छातीत दुखणे", "श्वास घेण्यास त्रास", "बेशुद्ध",
    "dolor de pecho", "no puedo respirar", "ataque al corazón",
    "douleur thoracique", "je ne peux pas respirer",
    "brustschmerzen", "kann nicht atmen",
)

ROUTER_SYSTEM_PROMPT = """You are Triage, the Medical Query Router & Safety Agent for MediLens.
Classify the user's intent into exactly one category:
- "emergency": User reports severe acute symptoms like chest pain, difficulty breathing, fainting, stroke signs, or severe bleeding.
- "doctor_prep": User is preparing to visit their doctor, asking what questions to ask, or what records to bring.
- "medicine": User asks about prescribed medications, doses, drug side effects, interactions, or tablets.
- "explain": User asks about their lab test results, what numbers mean, or general questions about the report.

Also identify the exact language of the user's input (e.g. "English", "Hindi", "Marathi", "Hinglish", "Spanish", "French", "German", "Tamil", "Telugu", "Bengali", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu", "Arabic", "Portuguese", "Italian", "Japanese", "Korean", "Chinese", etc.).

Return JSON only:
{"intent": "explain" | "doctor_prep" | "medicine" | "emergency", "language": "<Detected Language Name>"}
"""

# Map detected language names to ISO 639-1 codes supported by gTTS
LANG_TO_GTTS = {
    "english": "en",
    "hindi": "hi",
    "hinglish": "hi",
    "marathi": "mr",
    "tamil": "ta",
    "telugu": "te",
    "kannada": "kn",
    "malayalam": "ml",
    "bengali": "bn",
    "gujarati": "gu",
    "punjabi": "pa",
    "urdu": "ur",
    "arabic": "ar",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "portuguese": "pt",
    "italian": "it",
    "russian": "ru",
    "japanese": "ja",
    "korean": "ko",
    "chinese": "zh-CN",
    "mandarin": "zh-CN",
    "dutch": "nl",
    "turkish": "tr",
    "indonesian": "id",
    "vietnamese": "vi",
    "thai": "th",
    "polish": "pl",
    "swedish": "sv",
    "nepali": "ne",
    "sinhala": "si",
}


def detect_language(text: str) -> str:
    """Detect the input language/script from user text (supports Indic, European, East Asian & RTL scripts)."""
    if not text or not text.strip():
        return "English"

    # 1. Script-based detection (highest confidence)
    if len(re.findall(r"[\u0900-\u097F]", text)) >= 2:
        marathi_markers = (
            "आहे", "आहेत", "नाही", "नाहीत", "काय", "कसे", "कसा", "कशी",
            "माझे", "माझा", "माझी", "सांगा", "माहिती", "औषध", "तपासणी", "अहवाल", "करू", "करावे",
        )
        if any(m in text for m in marathi_markers):
            return "Marathi"
        return "Hindi"

    if len(re.findall(r"[\u0B80-\u0BFF]", text)) >= 2:
        return "Tamil"
    if len(re.findall(r"[\u0C00-\u0C7F]", text)) >= 2:
        return "Telugu"
    if len(re.findall(r"[\u0C80-\u0CFF]", text)) >= 2:
        return "Kannada"
    if len(re.findall(r"[\u0D00-\u0D7F]", text)) >= 2:
        return "Malayalam"
    if len(re.findall(r"[\u0980-\u09FF]", text)) >= 2:
        return "Bengali"
    if len(re.findall(r"[\u0A80-\u0AFF]", text)) >= 2:
        return "Gujarati"
    if len(re.findall(r"[\u0A00-\u0A7F]", text)) >= 2:
        return "Punjabi"
    if len(re.findall(r"[\u0600-\u06FF]", text)) >= 2:
        # Distinguish Urdu-specific characters vs Arabic
        if re.search(r"[ٹڈڑںےہپچژگ]", text):
            return "Urdu"
        return "Arabic"
    if len(re.findall(r"[\u3040-\u30FF]", text)) >= 2:
        return "Japanese"
    if len(re.findall(r"[\uAC00-\uD7AF]", text)) >= 2:
        return "Korean"
    if len(re.findall(r"[\u4E00-\u9FFF]", text)) >= 2:
        return "Chinese"
    if len(re.findall(r"[\u0400-\u04FF]", text)) >= 2:
        return "Russian"

    # 2. Whole-word Latin-script heuristics (strict word boundaries to avoid English false positives)
    lower = text.lower()
    words = set(re.findall(r"\b[a-zà-öø-ÿñç]+\b", lower))

    hinglish_words = {
        "kya", "mera", "meri", "mere", "batao", "bataiye", "kaise", "kyun", "kyu",
        "dawa", "dawai", "kripya", "samjhao", "samjhaiye", "thik", "theek", "hai", "hain", "mujhe",
    }
    marathi_latin = {"ahe", "aahe", "kay", "sanga", "aushadh", "majha", "majhi", "kasa", "kashi", "tumhi"}
    spanish_words = {"qué", "que", "cómo", "como", "por", "para", "mis", "mi", "hola", "significa", "resultados", "medicamento", "médico", "gracias", "tengo", "está", "están"}
    french_words = {"bonjour", "merci", "comment", "pourquoi", "quels", "quelles", "résultats", "médicament", "médecin", "expliquez", "signifie", "est-ce", "mon", "mes"}
    german_words = {"hallo", "danke", "warum", "bedeutet", "ergebnisse", "medikament", "arzt", "erklären", "mein", "meine", "bitte", "ist", "sind"}
    portuguese_words = {"olá", "obrigado", "obrigada", "como", "porque", "meus", "minha", "resultados", "remédio", "médico", "significa", "explique"}
    italian_words = {"ciao", "grazie", "perché", "cosa", "significa", "risultati", "farmaco", "medico", "spiega", "miei", "mia"}

    # Require at least 2 distinct words or 1 unmistakable word for non-English Latin languages
    if len(words & marathi_latin) >= 2 or (words & {"aushadh", "sanga", "majha", "majhi", "aahe"}):
        return "Marathi"
    if len(words & hinglish_words) >= 2 or (words & {"batao", "bataiye", "samjhao", "samjhaiye", "kripya", "dawai"}):
        return "Hinglish"
    if len(words & spanish_words) >= 2 or any(ch in text for ch in "¿¡ñ"):
        return "Spanish"
    if len(words & french_words) >= 2 or (words & {"bonjour", "pourquoi", "médicament", "médecin", "expliquez"}):
        return "French"
    if len(words & german_words) >= 2 or any(ch in text for ch in "ßäöü") or (words & {"warum", "bedeutet", "erklären", "medikament"}):
        return "German"
    if len(words & portuguese_words) >= 2 or (words & {"olá", "obrigado", "obrigada", "remédio"}):
        return "Portuguese"
    if len(words & italian_words) >= 2 or (words & {"ciao", "grazie", "perché", "farmaco"}):
        return "Italian"

    return "English"


def detect_tts_lang_code(text: str, hint_lang: str = "auto") -> str:
    """Detect the best gTTS ISO 639-1 language code for speaking text aloud."""
    detected = detect_language(text)
    if detected and detected != "English":
        return LANG_TO_GTTS.get(detected.lower(), "en")
    if hint_lang and hint_lang.lower() not in ("auto", "english", ""):
        return LANG_TO_GTTS.get(hint_lang.lower(), "en")
    return "en"


def route_query(message: str, selected_lang: str = "auto") -> Tuple[str, str]:
    """Route user query to appropriate agent and auto-detect the user's input language.

    Returns: (intent, detected_language)
    """
    text_lower = (message or "").lower().strip()

    # 1. Immediate Safety Check
    if any(k in text_lower for k in EMERGENCY_KEYWORDS):
        return "emergency", detect_language(message)

    # 2. Fast, zero-latency heuristic intent & language routing (no slow extra LLM round-trip!)
    doctor_keywords = [
        "doctor", "dr ", "visit", "appointment", "prepare", "prep", "questions for",
        "सवाल", "डॉक्टर से", "भेट", "विचारणे", "médico", "médecin", "arzt", "cita", "rendez-vous",
    ]
    medicine_keywords = [
        "medicine", "medication", "tablet", "drug", "pill", "prescription", "side effect",
        "timing", "dose", "dosage", "interaction", "metformin", "statin", "spironolactone",
        "दवा", "दवाई", "गोली", "औषध", "औषधे", "medicamento", "médicament", "medikament", "farmaco", "remédio",
    ]

    intent = "explain"
    if any(k in text_lower for k in medicine_keywords):
        intent = "medicine"
    elif any(k in text_lower for k in doctor_keywords):
        intent = "doctor_prep"

    lang = detect_language(message)
    return intent, lang
