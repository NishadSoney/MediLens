"""Unified LLM service supporting Gemini 3.5 Flash, Groq (gpt-oss-20b), and Meta Llama 3.1 (Ollama).

Cascade Architecture:
  1. Default: Google Gemini (gemini-3.5-flash with fast failover to gemini-3.5-flash-lite)
  2. 1st Fallback: Groq Cloud (openai/gpt-oss-20b ultra-fast LPU inference)
  3. 2nd Fallback: Local Meta Llama 3.1 8B (via Ollama on localhost:11434, 100% offline privacy)

Circuit Breakers:
  - If a provider encounters quota exhaustion, 503 high-load, or auth issues, it cools down
    automatically, instantaneously routing requests to the next fallback without freezing the UI.
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration & Environment Variables
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

# Model Names (configurable directly via .env)
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
OLLAMA_LLAMA_MODEL = os.environ.get("OLLAMA_LLAMA_MODEL", "llama3.1:8b")

# Default model when user hasn't selected one
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "gemini")

# Circuit breaker cooldown (seconds) when an API returns 401/403/503 or network failure
_PROVIDER_COOLDOWN_UNTIL: Dict[str, float] = {}
_COOLDOWN_SECONDS = 60.0


def _is_provider_cooled_down(provider: str) -> bool:
    return time.time() < _PROVIDER_COOLDOWN_UNTIL.get(provider, 0.0)


def _mark_provider_down(provider: str, seconds: float = _COOLDOWN_SECONDS) -> None:
    _PROVIDER_COOLDOWN_UNTIL[provider] = time.time() + seconds


MODEL_REGISTRY: Dict[str, Dict[str, str]] = {
    "gemini": {
        "display_name": f"Gemini ({GEMINI_MODEL})",
        "provider": "google",
        "icon": "sparkles",
        "color": "#4285F4",
        "description": "Google's ultra-fast multimodal model with vision support",
    },
    "groq": {
        "display_name": f"Groq ({GROQ_MODEL})",
        "provider": "groq",
        "icon": "zap",
        "color": "#F55036",
        "description": "Ultra-fast ~50ms inference on Groq LPU hardware",
    },
    "llama3.1": {
        "display_name": "Llama 3.1 (8B)",
        "provider": "ollama",
        "icon": "brain",
        "color": "#8B5CF6",
        "description": "Meta's open-weight model running locally via Ollama",
    },
}


# ---------------------------------------------------------------------------
# Provider Implementations
# ---------------------------------------------------------------------------

def call_gemini(
    prompt: str,
    system_prompt: str = "",
    image_bytes: Optional[bytes] = None,
    mime_type: str = "image/jpeg",
    max_tokens: int = 1536,
) -> str:
    """Call Google Gemini API via REST with fast fallback for high-demand spikes."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or _is_provider_cooled_down("gemini"):
        return ""

    import base64

    # Build Gemini request payload
    contents: List[Dict[str, Any]] = []
    user_parts: List[Dict[str, Any]] = []

    if image_bytes:
        user_parts.append({
            "inline_data": {
                "mime_type": mime_type,
                "data": base64.b64encode(image_bytes).decode("utf-8"),
            }
        })

    user_parts.append({"text": prompt})
    contents.append({"role": "user", "parts": user_parts})

    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": max_tokens,
        },
    }

    if system_prompt:
        payload["system_instruction"] = {
            "parts": [{"text": system_prompt}]
        }

    # Try configured model first; if 503 high load, fast failover to gemini-3.5-flash-lite
    candidate_models = [GEMINI_MODEL]
    if "flash" in GEMINI_MODEL and GEMINI_MODEL != "gemini-3.5-flash-lite":
        candidate_models.append("gemini-3.5-flash-lite")

    for model_name in candidate_models:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
            f"?key={api_key}"
        )
        try:
            response = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=(3, 12),
            )
            if response.status_code in (401, 403):
                print(f"Gemini API auth error ({response.status_code}) — cooling down")
                _mark_provider_down("gemini")
                return ""
            if response.status_code == 503:
                # High-demand spike, try next variant or fallback
                continue
            response.raise_for_status()
            data = response.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
        except requests.exceptions.Timeout:
            continue
        except requests.exceptions.ConnectionError:
            _mark_provider_down("gemini", seconds=30.0)
            break
        except Exception as e:
            print(f"Gemini ({model_name}) error: {e}")

    return ""


def call_groq(
    prompt: str,
    system_prompt: str = "",
    max_tokens: int = 1200,
) -> str:
    """Call Groq Cloud API with OpenAI-compatible payload (e.g. gpt-oss-20b)."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key or _is_provider_cooled_down("groq"):
        return ""

    url = "https://api.groq.com/openai/v1/chat/completions"
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=(3, 10),
        )
        if response.status_code in (401, 403):
            print(f"Groq API auth error ({response.status_code}) — cooling down")
            _mark_provider_down("groq")
            return ""
        response.raise_for_status()
        data = response.json()
        choice = data["choices"][0]
        content = choice["message"].get("content") or ""
        # If model outputs reasoning without content, use reasoning text
        if not content and "reasoning" in choice["message"]:
            content = choice["message"]["reasoning"]
        return content.strip()
    except requests.exceptions.ConnectionError as e:
        print(f"Groq connection error — cooling down: {e}")
        _mark_provider_down("groq", seconds=60.0)
    except Exception as e:
        print(f"Groq API error: {e}")
    return ""


def call_ollama(
    prompt: str,
    system_prompt: str = "",
    model: str = "llama3.1:8b",
    max_tokens: int = 1024,
) -> str:
    """Call local Meta Llama 3.1 model via Ollama with keep-alive and bounded predict tokens."""
    if model in ("llama3.1", "llama3", "llama"):
        model = OLLAMA_LLAMA_MODEL

    url = f"{OLLAMA_BASE_URL}/api/chat"
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "keep_alive": "15m",
        "options": {
            "temperature": 0.15,
            "num_predict": max_tokens,
        },
    }

    try:
        response = requests.post(url, json=payload, timeout=(3, 60), proxies={"http": None, "https": None})
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content", "")
        return content.strip()
    except Exception as e:
        print(f"Ollama ({model}) error: {e}")
    return ""


# ---------------------------------------------------------------------------
# Provider availability check
# ---------------------------------------------------------------------------

def check_model_status() -> Dict[str, Dict[str, Any]]:
    """Check which models are active and available right now."""
    status: Dict[str, Dict[str, Any]] = {}

    # Gemini
    status["gemini"] = {
        "available": bool(os.environ.get("GEMINI_API_KEY")),
        "type": "api",
        "model": GEMINI_MODEL,
    }

    # Groq
    status["groq"] = {
        "available": bool(os.environ.get("GROQ_API_KEY")),
        "type": "api",
        "model": GROQ_MODEL,
    }

    # Ollama Llama 3.1
    available = False
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2, proxies={"http": None, "https": None})
        if r.ok:
            models = [m.get("name", "") for m in r.json().get("models", [])]
            available = any(
                OLLAMA_LLAMA_MODEL in m or m.startswith(OLLAMA_LLAMA_MODEL.split(":")[0])
                for m in models
            )
    except Exception:
        pass
    status["llama3.1"] = {"available": available, "type": "local", "model": OLLAMA_LLAMA_MODEL}

    return status


def get_llm_provider() -> str:
    """Return the name of the top available provider in the cascade."""
    if os.environ.get("GEMINI_API_KEY") and not _is_provider_cooled_down("gemini"):
        return "gemini"
    if os.environ.get("GROQ_API_KEY") and not _is_provider_cooled_down("groq"):
        return "groq"
    # Try local Ollama
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2, proxies={"http": None, "https": None})
        if r.ok:
            return "llama3.1"
    except Exception:
        pass
    return "none"


# ---------------------------------------------------------------------------
# Unified Entry Point with Graceful Cascade Fallback
# ---------------------------------------------------------------------------

def generate_text(
    prompt: str,
    system_prompt: str = "",
    image_path: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: int = 1200,
) -> str:
    """Unified entry point for LLM generation with graceful 3-tier fallback.

    Cascade Flow:
      1. Primary: Gemini (gemini-3.5-flash)
      2. 1st Fallback: Groq (openai/gpt-oss-20b)
      3. 2nd Fallback: Local Llama 3.1 (Ollama)
    """
    img_bytes = None
    mime = "image/jpeg"
    if image_path and os.path.exists(image_path):
        try:
            with open(image_path, "rb") as f:
                img_bytes = f.read()
            if image_path.lower().endswith(".png"):
                mime = "image/png"
            elif image_path.lower().endswith(".pdf"):
                mime = "application/pdf"
        except Exception:
            pass

    # Resolve requested model
    target_model = model or DEFAULT_MODEL

    # --- 1. Target is Gemini ---
    if target_model == "gemini":
        result = call_gemini(prompt, system_prompt, image_bytes=img_bytes, mime_type=mime, max_tokens=max_tokens)
        if result:
            return result
        # Fallback 1: Groq
        result = call_groq(prompt, system_prompt, max_tokens=max_tokens)
        if result:
            return result
        # Fallback 2: Local Llama 3.1
        return call_ollama(prompt, system_prompt, model=OLLAMA_LLAMA_MODEL, max_tokens=max_tokens)

    # --- 2. Target is Groq ---
    if target_model == "groq":
        result = call_groq(prompt, system_prompt, max_tokens=max_tokens)
        if result:
            return result
        # Fallback: Local Llama 3.1
        result = call_ollama(prompt, system_prompt, model=OLLAMA_LLAMA_MODEL, max_tokens=max_tokens)
        if result:
            return result
        # Fallback: Gemini
        return call_gemini(prompt, system_prompt, image_bytes=img_bytes, mime_type=mime, max_tokens=max_tokens)

    # --- 3. Target is Local Llama 3.1 ---
    if target_model == "llama3.1":
        result = call_ollama(prompt, system_prompt, model=OLLAMA_LLAMA_MODEL, max_tokens=max_tokens)
        if result:
            return result
        # Fallback to Groq then Gemini if local model isn't running
        result = call_groq(prompt, system_prompt, max_tokens=max_tokens)
        if result:
            return result
        return call_gemini(prompt, system_prompt, image_bytes=img_bytes, mime_type=mime, max_tokens=max_tokens)

    # Unknown model: default to Gemini cascade
    return generate_text(prompt, system_prompt, image_path=image_path, model="gemini", max_tokens=max_tokens)
