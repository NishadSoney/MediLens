"""Explainer (MediLens Clinical Explainer Agent).

Role: Medical Report Explainer.
- Explains diagnostic test results in 1-2 simple sentences, abnormal first.
- Uses flagged test context to answer user queries accurately.
- Uses calm, reassuring, non-alarming wording and gives NO diagnosis.
- Produces concise overall summaries and structured 6-section detailed bullet summaries.
- Multilingual support (English, Hindi, Marathi).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from core.llm import generate_text
from agents.retriever import retrieve_clinical_context, build_report_clinical_query

EXPLAINER_SYSTEM_PROMPT = """You are Explainer, the Clinical Explainer Agent for MediLens.
Your mission is to help people understand their medical lab reports in simple, calm, accessible language, grounded in retrieved clinical reference knowledge (RAG).

Strict Safety & Medical Rules:
1. NEVER diagnose an illness or disease (say "this can be related to..." or "this suggests...").
2. NEVER prescribe, change medications, or tell the patient what treatment to take.
3. Ground your clinical explanations in the retrieved medical references and patient report excerpts when provided.
4. Keep explanations clear and straightforward — address abnormal (high, low, critical) results first.
5. Tone: Calm, empathetic, objective, and reassuring — never alarming or panicky.
6. Language Rule: Always reply strictly in the exact same language and script as the user's question.
7. Conclude with a brief, helpful reminder (in the SAME language as the user) to discuss findings with their doctor.
"""


def format_report_context(report: Optional[Dict[str, Any]]) -> str:
    """Format report tests and prescribed medicines into readable prompt context."""
    if not report:
        return "No specific lab report is currently attached."
    tests = report.get("tests", [])
    medicines = report.get("medicines", [])
    lines = []
    lines.append(f"Patient: {report.get('meta', {}).get('patient', 'Patient')}")
    lines.append(f"Date: {report.get('meta', {}).get('date', 'Recent')}")
    if tests:
        lines.append("\nTests Summary:")
        for t in tests:
            lines.append(
                f"- {t.get('name')}: {t.get('value')} {t.get('unit', '')} "
                f"(Range: {t.get('range', 'N/A')}) -> Flag: {t.get('status', 'normal').upper()}"
            )
    if medicines:
        lines.append("\nPrescriptions & Medications:")
        for m in medicines:
            lines.append(
                f"- {m.get('name')}: Purpose: {m.get('purpose', 'N/A')}, "
                f"Side Effects: {m.get('side_effects', 'N/A')}, Timing: {m.get('timing', 'N/A')}"
            )
    return "\n".join(lines)


def explain_query_with_rag(
    message: str,
    report: Optional[Dict[str, Any]],
    lang: str = "English",
    model: Optional[str] = None,
    session_id: str = "default",
) -> tuple[str, List[Dict[str, Any]]]:
    """Answer user follow-up questions grounded via Retriever (Hybrid Vector RAG) and return (reply, citations)."""
    context = format_report_context(report)
    rag_result = retrieve_clinical_context(
        query=message,
        report=report,
        session_id=session_id,
        top_k_kb=3,
        top_k_report=2,
    )
    rag_block = rag_result.get("context_text", "")
    citations = rag_result.get("citations", [])

    if not lang or lang.lower() == "auto":
        lang_instruction = "Reply strictly in the exact same language and script as the User Question."
    else:
        lang_instruction = f"Reply strictly in {lang} (matching the exact language and script of the User Question)."

    prompt = (
        f"Output Language: {lang_instruction}\n\n"
        f"User question: {message}\n\n"
        f"Patient Report Context:\n{context}\n\n"
        f"{rag_block}\n\n"
        "Instructions:\n"
        "- Answer the user's question directly in 2-4 clear, calm, natural sentences.\n"
        "- Ground your answer in the patient's actual lab values and the retrieved clinical references above.\n"
        "- If asked about a medicine, briefly cover its purpose, how it relates to any lab values/interactions, common side effects, and precautions.\n"
        "- Never diagnose definitively or advise changing doses. End with a brief reminder to consult their doctor.\n"
        f"- Output Language Reminder: {lang_instruction}"
    )

    resp = generate_text(prompt=prompt, system_prompt=EXPLAINER_SYSTEM_PROMPT, model=model, max_tokens=360)
    if resp:
        return resp.strip(), citations

    # Fallback template explanation if offline / no LLM key
    if not report:
        if rag_result.get("kb_matches"):
            top = rag_result["kb_matches"][0]
            return f"{top['title']}: {top['content']} Please consult your doctor for personalized advice.", citations
        return "I am here to help explain your health questions. Please upload a lab report or prescription for personalized context, or ask about any specific test or medicine.", citations

    text_lower = message.lower()

    # 1. Look for matching medicine name in fallback
    for m in report.get("medicines", []):
        med_name = m.get("name", "").lower()
        first_word = med_name.split()[0] if med_name else ""
        if (first_word and first_word in text_lower) or (med_name and med_name in text_lower):
            name = m.get("name")
            purp = m.get("purpose", "")
            se = m.get("side_effects", "")
            tim = m.get("timing", "")
            if lang == "Hindi":
                return f"{name}: इसका मुख्य उद्देश्य है '{purp}'। सामान्य दुष्प्रभाव: {se}। लेने का समय: {tim}। कृपया कोई भी खुराक बदलने से पहले अपने डॉक्टर से सलाह लें।", citations
            elif lang == "Marathi":
                return f"{name}: याचा मुख्य उद्देश '{purp}' आहे. संभाव्य दुष्परिणाम: {se}. वेळ: {tim}. कृपया आपल्या डॉक्टरांच्या सल्ल्याशिवाय कोणताही बदल करू नका.", citations
            return f"{name} is prescribed for: {purp}. Documented side effects: {se}. Prescribed schedule: {tim}. Always discuss your medication regimen with your doctor or pharmacist.", citations

    # 2. Look for matching test name
    for t in report.get("tests", []):
        if t.get("name", "").lower() in text_lower:
            name = t.get("name")
            val = t.get("value")
            unit = t.get("unit", "")
            rng = t.get("range", "")
            expl = t.get("explain", "")
            if lang == "Hindi":
                return f"{name}: {val} {unit} (सामान्य सीमा {rng})। {expl} कृपया अपने डॉक्टर से परामर्श करें।", citations
            elif lang == "Marathi":
                return f"{name}: {val} {unit} (नेहमीची मर्यादा {rng})। {expl} कृपया आपल्या डॉक्टरांचा सल्ला घ्या.", citations
            return f"{name} is {val} {unit} (usual range {rng}). {expl} Please discuss this with your doctor.", citations

    abnormal = [t for t in report.get("tests", []) if t.get("status") != "normal"]
    if abnormal:
        names = ", ".join(t.get("name") for t in abnormal[:3])
        if lang == "Hindi":
            return (
                f"आपकी रिपोर्ट में {len(abnormal)} परिणाम सामान्य सीमा से बाहर हैं, मुख्य रूप से: {names}। "
                "यह केवल सामान्य जानकारी है, कोई चिकित्सीय निदान नहीं। आप किसी भी परीक्षण के बारे में पूछ सकते हैं।"
            ), citations
        elif lang == "Marathi":
            return (
                f"आपल्या अहवालात {len(abnormal)} चाचण्या सामान्य मर्यादेबाहेर आहेत, प्रामुख्याने: {names}। "
                "ही केवळ सामान्य माहिती आहे. आपण कोणत्याही चाचणीबद्दल अधिक विचारू शकता."
            ), citations
        return (
            f"{len(abnormal)} of your results are outside the standard range, including {names}. "
            "Feel free to ask about any specific test, and I will explain what it means in plain words."
        ), citations

    if lang == "Hindi":
        return "आपके सभी परीक्षण परिणाम सामान्य सीमा के भीतर दिखाई दे रहे हैं।", citations
    elif lang == "Marathi":
        return "आपल्या सर्व चाचण्यांचे निकाल सामान्य मर्यादेत आहेत.", citations
    return "All your listed test results appear to be within the standard reference ranges.", citations


def explain_query(
    message: str,
    report: Optional[Dict[str, Any]],
    lang: str = "English",
    model: Optional[str] = None,
    session_id: str = "default",
) -> str:
    """Answer user follow-up questions about their report or medicines in simple, reassuring words."""
    reply, _ = explain_query_with_rag(
        message=message,
        report=report,
        lang=lang,
        model=model,
        session_id=session_id,
    )
    return reply


def generate_overall_summary(
    report: Dict[str, Any],
    lang: str = "English",
    model: Optional[str] = None,
    session_id: str = "default",
) -> str:
    """Generate a fast, calm 2-3 sentence overall summary for the report."""
    tests = report.get("tests", [])
    abnormal = [t for t in tests if t.get("status") != "normal"]
    critical = [t for t in tests if t.get("status") == "critical"]

    context = format_report_context(report)
    prompt = (
        f"Language: {lang}\n"
        f"Write a concise 2-3 sentence plain-language summary directly for the patient (no preamble like 'Here is a summary'):\n"
        f"{context}\n\n"
        "Highlight any critical or out-of-range values calmly first, mention what looks normal, and end with a reminder to review this with their doctor."
    )

    resp = generate_text(prompt=prompt, system_prompt=EXPLAINER_SYSTEM_PROMPT, model=model, max_tokens=160)
    if resp:
        return resp.strip()

    # Fallback template summary
    if not tests:
        return "No test results were found in the uploaded document."

    if critical:
        crit_names = ", ".join(t.get("name") for t in critical)
        return (
            f"Most results are reviewed, but {crit_names} is significantly outside the expected range. "
            "Please contact your healthcare provider or clinic promptly for an evaluation."
        )
    elif abnormal:
        ab_names = ", ".join(t.get("name") for t in abnormal[:3])
        return (
            f"Most of your results are in the standard range. A few markers ({ab_names}) "
            "are slightly outside typical values. Review these with your doctor at your next appointment."
        )
    else:
        return "All identified test parameters are currently within normal expected ranges."


DETAILED_SUMMARY_SYSTEM_PROMPT = """You are MediLens's Senior Patient Communication Specialist.
Your goal is to explain an ENTIRE medical report (lab tests, imaging/CT/X-ray measurements, surgical notes, or prescriptions) in crystal-clear, everyday bullet points so a non-medical person immediately understands what the report actually means.

Strict Clinical Safety Rules:
1. NEVER give a definitive medical diagnosis (use phrases like "can be associated with", "often seen when", "worth discussing with your doctor").
2. NEVER advise stopping, starting, or changing any medication dosage.
3. Use simple, warm, reassuring, jargon-free language — explain medical terms in parentheses if used.
4. Reply in the requested language (or match the user's language if specified).
5. Return ONLY a valid JSON object matching this exact structure:
{
  "headline": "One clear sentence summarizing what this report is overall",
  "sections": [
    {
      "title": "What This Report Is About",
      "tone": "info",
      "bullets": ["Plain bullet 1", "Plain bullet 2"]
    },
    {
      "title": "Needs Prompt Medical Attention (Critical Findings)",
      "tone": "critical",
      "bullets": ["..."]
    },
    {
      "title": "Out-of-Range Results Explained Simply",
      "tone": "warning",
      "bullets": ["..."]
    },
    {
      "title": "What Looks Healthy (Normal Results)",
      "tone": "positive",
      "bullets": ["..."]
    },
    {
      "title": "Medications & Regimen Overview",
      "tone": "medication",
      "bullets": ["..."]
    },
    {
      "title": "Recommended Next Steps & Doctor Discussion",
      "tone": "action",
      "bullets": ["..."]
    }
  ]
}
Omit any section that does not apply (for example, omit "Needs Prompt Medical Attention" if there are no critical findings, and omit "Medications" if no drugs are listed). Every section must contain 2-5 concise, super easy-to-read bullet points.
"""


def _build_fallback_detailed_summary(report: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic, thorough bullet-point summary when LLM JSON parsing fails or offline."""
    meta = report.get("meta", {})
    tests = report.get("tests", [])
    meds = report.get("medicines", [])

    critical = [t for t in tests if t.get("status") == "critical"]
    out_of_range = [t for t in tests if t.get("status") in ("high", "low")]
    normal = [t for t in tests if t.get("status") == "normal"]

    lab = meta.get("lab") or "your healthcare facility"
    date = meta.get("date") or "recent visit"
    patient = meta.get("patient") or "Patient"

    sections: List[Dict[str, Any]] = []

    # 1. Overview
    overview_bullets = [
        f"This report from {lab} ({date}) reviews {len(tests)} clinical parameter(s) for {patient}.",
        f"Overall snapshot: {len(normal)} result(s) are within the usual healthy range, {len(out_of_range)} are mildly/moderately outside range, and {len(critical)} are flagged as critical.",
    ]
    if report.get("summary"):
        overview_bullets.append(report["summary"])
    sections.append({
        "title": "What This Report Is About",
        "tone": "info",
        "bullets": overview_bullets,
    })

    # 2. Critical
    if critical:
        crit_bullets = []
        for t in critical:
            expl = t.get("explain") or "Significantly outside the safe reference interval and requires prompt clinician evaluation."
            crit_bullets.append(
                f"{t.get('name')}: {t.get('value')} {t.get('unit', '')} (usual range {t.get('range', 'N/A')}) — {expl}"
            )
        sections.append({
            "title": "Needs Prompt Medical Attention (Critical Findings)",
            "tone": "critical",
            "bullets": crit_bullets,
        })

    # 3. Out-of-Range
    if out_of_range:
        ab_bullets = []
        for t in out_of_range:
            direction = "above" if t.get("status") == "high" else "below"
            expl = t.get("explain") or f"This measurement is {direction} the typical reference range and should be reviewed with your physician."
            ab_bullets.append(
                f"{t.get('name')} ({t.get('status', '').upper()}): {t.get('value')} {t.get('unit', '')} vs. normal {t.get('range', 'N/A')} — {expl}"
            )
        sections.append({
            "title": "Out-of-Range Results Explained Simply",
            "tone": "warning",
            "bullets": ab_bullets,
        })

    # 4. Normal
    if normal:
        norm_names = ", ".join(f"{t.get('name')} ({t.get('value')} {t.get('unit', '')})".strip() for t in normal[:6])
        norm_bullets = [
            f"{len(normal)} tested marker(s) fall safely inside standard reference ranges, including: {norm_names}."
        ]
        if len(normal) > 6:
            norm_bullets.append(f"Plus {len(normal) - 6} additional marker(s) also within expected normal limits.")
        sections.append({
            "title": "What Looks Healthy (Normal Results)",
            "tone": "positive",
            "bullets": norm_bullets,
        })

    # 5. Medications
    if meds:
        med_bullets = []
        for m in meds:
            med_bullets.append(
                f"{m.get('name')}: {m.get('purpose', 'Prescribed medication')} · Timing: {m.get('timing', 'As directed by your doctor')}."
            )
        med_bullets.append("Safety reminder: Never stop or adjust your dose without speaking with your prescribing doctor first.")
        sections.append({
            "title": "Medications & Regimen Overview",
            "tone": "medication",
            "bullets": med_bullets,
        })

    # 6. Next Steps
    next_bullets = []
    if critical:
        next_bullets.append(f"Contact your doctor or clinic promptly to review your critical {critical[0].get('name')} result.")
    else:
        next_bullets.append("Bring this report and your current medication list to your next doctor appointment.")
    if out_of_range:
        next_bullets.append(
            f"Ask your doctor whether repeat testing, lifestyle adjustments, or follow-up workup is needed for {', '.join(t.get('name') for t in out_of_range[:3])}."
        )
    next_bullets.append("Use MediLens's 'Doctor Prep' tab to download a structured checklist of questions for your consultation.")
    sections.append({
        "title": "Recommended Next Steps",
        "tone": "action",
        "bullets": next_bullets,
    })

    headline = (
        f"{len(critical)} critical and {len(out_of_range)} out-of-range finding(s) detected out of {len(tests)} total parameters — prompt physician review recommended."
        if critical
        else f"{len(normal)} of {len(tests)} parameters are normal, with {len(out_of_range)} out-of-range item(s) to discuss with your doctor."
        if out_of_range
        else f"All {len(tests)} analyzed parameters are within standard healthy reference ranges."
    )

    return {"headline": headline, "sections": sections}


def _sections_to_plain_text(headline: str, sections: List[Dict[str, Any]]) -> str:
    lines = [headline, ""]
    for sec in sections:
        lines.append(f"## {sec.get('title', '')}")
        for b in sec.get("bullets", []):
            lines.append(f"• {b}")
        lines.append("")
    lines.append("Note: General health information only. Not a medical diagnosis. Always consult your doctor.")
    return "\n".join(lines).strip()


def generate_detailed_bullet_summary(
    report: Dict[str, Any],
    lang: str = "English",
    model: Optional[str] = None,
    session_id: str = "default",
) -> Dict[str, Any]:
    """Generate a comprehensive, RAG-grounded plain-language bullet-point summary of the entire report."""
    import re

    context = format_report_context(report)
    existing_summary = report.get("summary", "")
    rag_query = build_report_clinical_query(report)
    rag_res = retrieve_clinical_context(
        query=rag_query,
        report=report,
        session_id=session_id,
        top_k_kb=3,
        top_k_report=2,
    )
    rag_block = rag_res.get("context_text", "")

    prompt = (
        f"Language for ALL text, titles, and bullets: {lang}\n\n"
        f"Full Medical Report Context:\n{context}\n\n"
        f"Short Summary Context: {existing_summary}\n\n"
        f"{rag_block}\n\n"
        "Generate a thorough, easy-to-understand bullet-point breakdown covering the entire report "
        "grounded in the retrieved clinical references above, so a patient immediately understands what the report actually shows, "
        "what is urgent or out of range, what is healthy, what their medicines do (including any relevant clinical monitoring points), "
        "and what steps to take next. Return ONLY valid JSON following the exact schema."
    )

    resp = generate_text(prompt=prompt, system_prompt=DETAILED_SUMMARY_SYSTEM_PROMPT, model=model)
    parsed: Optional[Dict[str, Any]] = None

    if resp:
        try:
            cleaned = re.sub(r"```json\s*", "", resp)
            cleaned = re.sub(r"```\s*", "", cleaned).strip()
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1:
                candidate = json.loads(cleaned[start : end + 1])
                if isinstance(candidate, dict) and isinstance(candidate.get("sections"), list) and len(candidate["sections"]) > 0:
                    # Sanitize sections
                    clean_sections = []
                    for sec in candidate["sections"]:
                        bullets = [str(b).strip() for b in sec.get("bullets", []) if str(b).strip()]
                        if bullets:
                            clean_sections.append({
                                "title": str(sec.get("title", "Summary")).strip(),
                                "tone": str(sec.get("tone", "info")).strip().lower(),
                                "bullets": bullets,
                            })
                    if clean_sections:
                        parsed = {
                            "headline": str(candidate.get("headline", "Detailed Report Summary")).strip(),
                            "sections": clean_sections,
                        }
        except Exception as e:
            print(f"Detailed summary JSON parse fallback: {e}")

    if not parsed:
        parsed = _build_fallback_detailed_summary(report)

    parsed["plain_text"] = _sections_to_plain_text(parsed["headline"], parsed["sections"])
    parsed["rag_sources"] = rag_res.get("citations", [])
    return parsed
