"""Document and image parser for medical lab reports and prescriptions."""

from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def is_pdf(file_path: str) -> bool:
    return file_path.lower().endswith(".pdf")


def is_image(file_path: str) -> bool:
    return file_path.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"))


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract embedded text from digital PDF using pdfplumber, PyMuPDF (fitz), or pypdf."""
    text_content = []

    # 1. Try pdfplumber (highest fidelity text and spatial positioning, standard in this environment)
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_content.append(t)
        if text_content:
            return "\n".join(text_content).strip()
    except ImportError:
        pass
    except Exception:
        pass

    # 2. Try PyMuPDF (fitz)
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(pdf_path)
        for page in doc:
            t = page.get_text()
            if t:
                text_content.append(t)
        doc.close()
        if text_content:
            return "\n".join(text_content).strip()
    except ImportError:
        pass
    except Exception:
        pass

    # 3. Try pypdf fallback
    try:
        import pypdf
        reader = pypdf.PdfReader(pdf_path)
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text_content.append(t)
        if text_content:
            return "\n".join(text_content).strip()
    except ImportError:
        pass
    except Exception:
        pass

    return ""


def encode_image_base64(image_path: str) -> str:
    """Encode an image or first page of document to base64 for multimodal LLM analysis."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def parse_document(file_path: str) -> Dict[str, Any]:
    """Parse document file path. Returns text and image metadata."""
    if not file_path or not os.path.exists(file_path):
        return {"text": "", "is_scanned": False, "file_type": "unknown"}

    if is_pdf(file_path):
        text = extract_text_from_pdf(file_path)
        is_scanned = len(text.strip()) < 50
        return {
            "text": text,
            "is_scanned": is_scanned,
            "file_type": "pdf",
            "file_path": file_path
        }
    elif is_image(file_path):
        return {
            "text": "",
            "is_scanned": True,
            "file_type": "image",
            "file_path": file_path
        }
    else:
        # Fallback text reading
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
            return {"text": text, "is_scanned": False, "file_type": "text", "file_path": file_path}
        except Exception:
            return {"text": "", "is_scanned": True, "file_type": "binary", "file_path": file_path}
