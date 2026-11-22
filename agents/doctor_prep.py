"""Advocate (MediLens Doctor Visit Preparation Agent).

Role: Doctor Visit Coach & Patient Advocate.
- Takes abnormal results and formulates 5-7 actionable, targeted questions for the doctor.
- Suggests an essential checklist of what to bring (past reports, medicine bottles, symptom notes).
- Generates a concise, structured one-page summary document for the consultation.
- Supports English, Hindi, and Marathi.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from core.llm import generate_text
from agents.retriever import retrieve_clinical_context, build_report_clinical_query

DOCTOR_PREP_SYSTEM_PROMPT = """You are Advocate, the Doctor Visit Coach & Patient Advocate Agent for MediLens.
Your goal is to empower patients to have productive, focused conversations with their physician.

Rules:
1. Examine the abnormal lab test results.
2. Formulate 5 to 7 specific, intelligent, practical questions the patient can ask their doctor.
3. Suggest 3 key things to bring to the appointment.
4. Output strictly valid JSON matching:
{
  "questions": ["Question 1", "Question 2", ...],
  "bring": ["Item 1", "Item 2", "Item 3"]
}
5. Language: Provide ALL output in the requested language (any language specified — e.g. English, Hindi, Marathi, Spanish, French, Tamil, etc.).
"""


def generate_doctor_prep(
    report: Dict[str, Any],
    lang: str = "English",
    model: Optional[str] = None,
    session_id: str = "default",
) -> Dict[str, Any]:
    """Generate RAG-grounded targeted questions and a checklist for the patient's doctor visit."""
    tests = report.get("tests", [])
    abnormal = [t for t in tests if t.get("status") != "normal"]

    rag_query = build_report_clinical_query(report)
    rag_block = retrieve_clinical_context(
        query=rag_query,
        report=report,
        session_id=session_id,
        top_k_kb=3,
        top_k_report=1,
    ).get("context_text", "")

    prompt = (
        f"Language: {lang}\n"
        f"Patient details: {report.get('meta', {}).get('patient', 'Patient')}\n"
        f"Abnormal test results:\n"
    )
    for t in abnormal:
        prompt += f"- {t.get('name')}: {t.get('value')} {t.get('unit')} (Range: {t.get('range')}) [{t.get('status').upper()}]\n"
    if report.get("medicines"):
        prompt += "\nCurrent medications:\n"
        for m in report.get("medicines", []):
            prompt += f"- {m.get('name')} ({m.get('timing', 'as prescribed')})\n"
    if rag_block:
        prompt += f"\n{rag_block}\n"
    prompt += "\nCreate 5-7 specific, guideline-grounded questions for the doctor and a checklist of what to bring."

    resp = generate_text(prompt=prompt, system_prompt=DOCTOR_PREP_SYSTEM_PROMPT, model=model)
    if resp:
        try:
            cleaned = re.sub(r"```json\s*", "", resp)
            cleaned = re.sub(r"```\s*", "", cleaned).strip()
            data = json.loads(cleaned)
            if "questions" in data and isinstance(data["questions"], list):
                if "bring" not in data:
                    data["bring"] = [
                        "This report and any previous lab tests",
                        "A list or original bottles of all current medicines",
                        "Notes on your daily symptoms or lifestyle habits"
                    ]
                return data
        except Exception:
            pass

    # High-quality fallback rule generator
    questions = []
    for t in abnormal[:5]:
        name = t.get("name")
        val = t.get("value")
        unit = t.get("unit", "")
        rng = t.get("range", "")
        if lang == "Hindi":
            questions.append(f"मेरा {name} {val} {unit} है (सामान्य सीमा {rng})। इसका मुख्य कारण क्या हो सकता है और मुझे क्या सावधानियां बरतनी चाहिए?")
        elif lang == "Marathi":
            questions.append(f"माझे {name} {val} {unit} आले आहे (नेहमीची मर्यादा {rng})। याचे कारण काय असू शकते आणि मी काय काळजी घ्यावी?")
        else:
            questions.append(f"My {name} is {val} {unit} (usual range {rng}). What could be causing this, and do I need lifestyle changes or treatment?")

    if lang == "Hindi":
        questions.append("क्या मुझे यह जांच दोबारा करवानी होगी, और कितने समय बाद?")
        questions.append("क्या मुझे किसी आहार या जीवनशैली में तुरंत बदलाव करने की आवश्यकता है?")
        bring = [
            "यह रिपोर्ट तथा पुरानी सभी चिकित्सा रिपोर्ट्स",
            "वर्तमान में ली जा रही सभी दवाइयों की सूची या डिब्बे",
            "लक्षणों की डायरी (वे कब शुरू हुए और कैसा महसूस होता है)"
        ]
    elif lang == "Marathi":
        questions.append("मला ही चाचणी पुन्हा करावी लागेल का, आणि कधी?")
        questions.append("माझ्या आहारात किंवा जीवनशैलीत काही तातडीने बदल करणे आवश्यक आहे का?")
        bring = [
            "हा अहवाल आणि आधीच्या वैद्यकीय चाचण्यांचे अहवाल",
            "सध्या चालू असलेल्या सर्व औषधांची यादी किंवा पाकिटे",
            "आपल्या लक्षणांची नोंद (कधी सुरू झाली आणि काय त्रास होतो)"
        ]
    else:
        questions.append("Do I need any follow-up or confirmatory tests, and if so, when?")
        questions.append("Are there any immediate dietary or activity precautions I should take?")
        bring = [
            "This report and your previous lab reports",
            "A complete list or containers of all medicines & supplements you take",
            "A short log of any symptoms you've noticed recently"
        ]

    return {
        "questions": questions[:7],
        "bring": bring
    }


def generate_summary_document(report: Dict[str, Any], prep: Dict[str, Any]) -> str:
    """Create a structured one-page summary to print or show to the doctor."""
    meta = report.get("meta", {})
    lines = [
        "===========================================================",
        "                 PATIENT HEALTH REPORT SUMMARY             ",
        "===========================================================",
        f"Laboratory  : {meta.get('lab', 'N/A')}",
        f"Date        : {meta.get('date', 'N/A')}",
        f"Patient Info: {meta.get('patient', 'N/A')}",
        "-----------------------------------------------------------",
        "",
        "KEY FINDINGS OUTSIDE STANDARD REFERENCE RANGES:",
    ]

    abnormal = [t for t in report.get("tests", []) if t.get("status") != "normal"]
    if not abnormal:
        lines.append("• All tests are within normal reference ranges.")
    else:
        for t in abnormal:
            lines.append(
                f"• {t.get('name')}: {t.get('value')} {t.get('unit')} "
                f"(Ref: {t.get('range')}) -> [{t.get('status').upper()}]"
            )

    lines.append("")
    lines.append("QUESTIONS PREPARED FOR THE DOCTOR:")
    for idx, q in enumerate(prep.get("questions", []), 1):
        lines.append(f"{idx}. {q}")

    lines.append("")
    lines.append("CHECKLIST FOR VISIT:")
    for b in prep.get("bring", []):
        lines.append(f"[ ] {b}")

    lines.append("")
    lines.append("-----------------------------------------------------------")
    lines.append("NOTICE: This summary is automatically prepared for personal")
    lines.append("consultation preparation only and is not a medical diagnosis.")
    lines.append("===========================================================")

    return "\n".join(lines)
