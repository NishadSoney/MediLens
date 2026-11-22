"""PharmAssist (MediLens Prescription & Pharmacology Agent).

Role: Explains general information about prescribed medications.
- Extracts and explains medicine names from prescriptions.
- Clarifies general purpose, common side effects, and timing as printed.
- SAFETY RULE: NEVER suggests dose changes, brand substitutes, or stopping medications.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from core.llm import generate_text
from agents.retriever import retrieve_clinical_context
from core.medical_apis import get_rxnorm_drug_info, get_fda_drug_warnings, get_cdsco_india_drug_info

MEDICINE_SYSTEM_PROMPT = """You are PharmAssist, the Prescription & Pharmacology Agent for MediLens.
Your role is to explain general facts about prescribed medications to help patients understand their regimen.

CRITICAL SAFETY RULES:
1. NEVER suggest changing a dose or adjusting timing contrary to the prescription.
2. NEVER suggest stopping any medicine.
3. NEVER recommend alternative drugs or brand substitutions.
4. Provide ONLY:
   - "name": Medicine name and strength
   - "purpose": Plain-language explanation of what condition this medicine is generally used for
   - "side_effects": Common, well-known side effects
   - "timing": Timing as printed on the prescription (or general guidance e.g. "after food as directed")
5. Return JSON format:
[
  {"name": "...", "purpose": "...", "side_effects": "...", "timing": "..."}
]
"""

# Standard verified drug info reference table (instant 0ms lookup)
_KNOWN_DRUGS = {
    "metformin": {
        "purpose": "Helps the body respond better to insulin and lowers glucose production in the liver.",
        "side_effects": "Upset stomach, nausea, or mild loose stools, especially during initial days.",
        "timing": "Usually taken with or after meals to minimize stomach discomfort."
    },
    "atorvastatin": {
        "purpose": "Lowers LDL ('bad') cholesterol and triglycerides in the blood.",
        "side_effects": "Occasional muscle aches, headache, or mild fatigue.",
        "timing": "Typically taken once daily, often in the evening or night."
    },
    "rosuvastatin": {
        "purpose": "Lowers LDL ('bad') cholesterol and triglycerides to support heart health.",
        "side_effects": "Occasional mild muscle aches, headache, or stomach upset.",
        "timing": "Once daily at a consistent time, with or without food."
    },
    "vitamin d": {
        "purpose": "Replenishes low vitamin D levels to support bone mineralization, calcium uptake, and immunity.",
        "side_effects": "Generally very well tolerated at standard therapeutic doses.",
        "timing": "As prescribed (often once weekly or daily with a meal)."
    },
    "cholecalciferol": {
        "purpose": "Replenishes low vitamin D3 levels for bone, muscle, and immune support.",
        "side_effects": "Generally very well tolerated at prescribed doses.",
        "timing": "Usually taken with a meal containing healthy fat."
    },
    "levothyroxine": {
        "purpose": "Replaces thyroid hormone (T4) when the thyroid gland is underactive.",
        "side_effects": "Usually well tolerated at the right dose; inform your doctor of palpitations or restlessness.",
        "timing": "Typically taken on an empty stomach with plain water 30–60 minutes before breakfast."
    },
    "ferrous": {
        "purpose": "Replenishes iron and ferritin stores to support healthy hemoglobin production.",
        "side_effects": "Dark stools, mild constipation, or stomach upset.",
        "timing": "As directed; avoid taking simultaneously with tea, coffee, or calcium supplements."
    },
    "iron": {
        "purpose": "Replenishes iron stores to support red blood cell and hemoglobin levels.",
        "side_effects": "Dark stools, mild constipation, or stomach discomfort.",
        "timing": "As directed by your physician."
    },
    "methylcobalamin": {
        "purpose": "Replenishes Vitamin B12 levels to support nerve health and red blood cell maturation.",
        "side_effects": "Generally very well tolerated.",
        "timing": "Once daily or as printed on your prescription."
    },
    "vitamin b12": {
        "purpose": "Supports healthy nerve function and red blood cell production.",
        "side_effects": "Generally very well tolerated.",
        "timing": "As printed on your prescription."
    },
    "spironolactone": {
        "purpose": "A potassium-sparing diuretic used to manage fluid retention, blood pressure, or heart strain.",
        "side_effects": "Can raise blood potassium levels, dizziness, or increased urination; requires periodic electrolyte checks.",
        "timing": "Usually taken once daily in the morning with food."
    },
    "furosemide": {
        "purpose": "A loop diuretic ('water pill') that helps the kidneys remove excess fluid and reduce swelling.",
        "side_effects": "Increased urination, dizziness, or changes in electrolytes like potassium.",
        "timing": "Usually taken in the morning to avoid nighttime urination."
    },
    "losartan": {
        "purpose": "Relaxes blood vessels to lower blood pressure and protect kidney function.",
        "side_effects": "Mild dizziness, fatigue, or elevated potassium levels in some patients.",
        "timing": "Once daily at the same time each day."
    },
    "lisinopril": {
        "purpose": "An ACE inhibitor that relaxes blood vessels to lower blood pressure and ease heart workload.",
        "side_effects": "Dry cough, mild dizziness, or changes in potassium/kidney labs.",
        "timing": "Once daily at a consistent time."
    },
    "ramipril": {
        "purpose": "An ACE inhibitor that lowers blood pressure and supports heart and kidney protection.",
        "side_effects": "Occasional dry cough, lightheadedness, or elevated potassium.",
        "timing": "Once daily as directed."
    },
    "pantoprazole": {
        "purpose": "Reduces excess stomach acid production, helping with acidity, reflux, or heartburn.",
        "side_effects": "Occasional headache or mild stomach cramps.",
        "timing": "Usually taken 30 minutes before the first meal of the day."
    },
    "omeprazole": {
        "purpose": "Suppresses excess stomach acid to relieve reflux, gastritis, or protect the stomach lining.",
        "side_effects": "Occasional headache or mild digestive discomfort.",
        "timing": "Usually taken 30 minutes before breakfast."
    },
    "telmisartan": {
        "purpose": "Helps relax blood vessels, lowering blood pressure and protecting kidney function.",
        "side_effects": "Mild dizziness when standing quickly, fatigue.",
        "timing": "Once daily at the same time each day."
    },
    "amlodipine": {
        "purpose": "Relaxes arterial muscles to reduce blood pressure and improve blood flow.",
        "side_effects": "Swelling around the ankles or feet, lightheadedness.",
        "timing": "Once daily, with or without food."
    },
    "paracetamol": {
        "purpose": "Used for temporary relief of mild-to-moderate pain and reduction of fever.",
        "side_effects": "Rare at recommended doses; gentle on the stomach when kept within daily limits.",
        "timing": "Taken as needed with water, adhering strictly to the prescribed maximum daily limit."
    },
    "acetaminophen": {
        "purpose": "Relieves mild-to-moderate pain and reduces fever.",
        "side_effects": "Rare at recommended doses; strictly follow maximum daily dose limits.",
        "timing": "As directed on your prescription."
    },
    "cefuroxime": {
        "purpose": "A broad-spectrum antibiotic used to treat or prevent bacterial infections.",
        "side_effects": "Mild nausea, loose stools, or stomach upset.",
        "timing": "Usually taken after food; complete the full prescribed course unless advised otherwise."
    },
    "amoxicillin": {
        "purpose": "A penicillin-class antibiotic prescribed to treat bacterial infections.",
        "side_effects": "Mild stomach upset, loose stools, or occasional rash.",
        "timing": "Taken as printed; complete the full course unless your doctor advises stopping."
    },
    "aspirin": {
        "purpose": "Helps prevent blood clots (at low doses) or relieves pain and inflammation.",
        "side_effects": "Stomach irritation or increased bruising.",
        "timing": "Usually taken after food as prescribed."
    },
    "glimepiride": {
        "purpose": "Helps the pancreas release insulin to lower blood sugar in type 2 diabetes.",
        "side_effects": "Low blood sugar (hypoglycemia) if meals are skipped, mild dizziness.",
        "timing": "Usually taken shortly before or with the first main meal of the day."
    },
    "empagliflozin": {
        "purpose": "Helps lower blood sugar and supports heart and kidney health by removing excess glucose via urine.",
        "side_effects": "Increased urination, mild dehydration, or urinary/genital irritation.",
        "timing": "Once daily in the morning, with or without food."
    },
}


def explain_medicine(med_name: str, timing_printed: str = "", lang: str = "English", model: Optional[str] = None) -> Dict[str, str]:
    """Provide verified general information for a medicine."""
    med_lower = med_name.lower()
    
    # Check known database first
    matched = None
    for drug_key, data in _KNOWN_DRUGS.items():
        if drug_key in med_lower:
            matched = data
            break

    if matched:
        return {
            "name": med_name,
            "purpose": matched["purpose"],
            "side_effects": matched["side_effects"],
            "timing": timing_printed or matched["timing"]
        }

    # Retrieve pharmacology & interaction grounding via Retriever (RAG)
    rag_res = retrieve_clinical_context(
        query=f"{med_name} pharmacology side effects timing interactions",
        top_k_kb=2,
        top_k_report=0,
        categories=["pharmacology", "interaction"],
    )
    rag_block = rag_res.get("context_text", "")

    # If LLM available, query it with RAG grounding + safety guardrails
    prompt = (
        f"Provide general medical information for: {med_name}. Timing noted: {timing_printed}.\n\n"
        f"{rag_block}"
    )
    resp = generate_text(prompt=prompt, system_prompt=MEDICINE_SYSTEM_PROMPT, model=model)
    if resp:
        try:
            cleaned = re.sub(r"```json\s*", "", resp)
            cleaned = re.sub(r"```\s*", "", cleaned).strip()
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed[0]
            elif isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

    return {
        "name": med_name,
        "purpose": "Prescribed medication. Please discuss the intended indication with your doctor or pharmacist.",
        "side_effects": "Mild stomach discomfort or headache can occur with many medications.",
        "timing": timing_printed or "Take exactly as directed by your prescribing physician."
    }


def get_medicines_info(report: Dict[str, Any], lang: str = "English", model: Optional[str] = None) -> List[Dict[str, str]]:
    """Return enriched medicine information list for the report (instant lookup + single batched LLM call)."""
    meds = report.get("medicines", [])
    if not meds:
        return []

    enriched: List[Optional[Dict[str, str]]] = [None] * len(meds)
    unknown_indices: List[int] = []

    for idx, m in enumerate(meds):
        name = m.get("name", "")
        timing = m.get("timing", "")
        if m.get("purpose") and m.get("side_effects"):
            enriched[idx] = m
            continue

        # Instant 0ms lookup against known clinical drug table
        med_lower = name.lower()
        matched = None
        for drug_key, data in _KNOWN_DRUGS.items():
            if drug_key in med_lower:
                matched = data
                break

        if matched:
            enriched[idx] = {
                "name": name,
                "purpose": matched["purpose"],
                "side_effects": matched["side_effects"],
                "timing": timing or matched["timing"],
            }
        else:
            unknown_indices.append(idx)

    # Batch ALL remaining unknown drugs into ONE single LLM call (instead of N sequential calls)
    if unknown_indices:
        drug_list = "\n".join(
            f"- {meds[i].get('name', '')} (Timing: {meds[i].get('timing', 'as directed')})"
            for i in unknown_indices
        )
        rag_res = retrieve_clinical_context(
            query=" ".join(meds[i].get("name", "") for i in unknown_indices) + " pharmacology side effects",
            top_k_kb=2,
            top_k_report=0,
            categories=["pharmacology", "interaction"],
        )
        rag_block = rag_res.get("context_text", "")
        prompt = (
            f"Provide general medical information as a JSON array for ALL of these medications:\n{drug_list}\n\n"
            f"{rag_block}"
        )
        resp = generate_text(prompt=prompt, system_prompt=MEDICINE_SYSTEM_PROMPT, model=model, max_tokens=700)
        parsed_list: List[Dict[str, Any]] = []
        if resp:
            try:
                cleaned = re.sub(r"```json\s*", "", resp)
                cleaned = re.sub(r"```\s*", "", cleaned).strip()
                start, end = cleaned.find("["), cleaned.rfind("]")
                if start != -1 and end != -1:
                    candidate = json.loads(cleaned[start : end + 1])
                    if isinstance(candidate, list):
                        parsed_list = candidate
            except Exception:
                pass

        for pos, orig_idx in enumerate(unknown_indices):
            orig = meds[orig_idx]
            if pos < len(parsed_list) and isinstance(parsed_list[pos], dict):
                item = parsed_list[pos]
                enriched[orig_idx] = {
                    "name": item.get("name") or orig.get("name", ""),
                    "purpose": item.get("purpose") or "Prescribed medication. Discuss its indication with your doctor.",
                    "side_effects": item.get("side_effects") or "Mild stomach discomfort or headache can occur.",
                    "timing": orig.get("timing") or item.get("timing") or "Take exactly as directed by your doctor.",
                }
            else:
                enriched[orig_idx] = {
                    "name": orig.get("name", ""),
                    "purpose": "Prescribed medication. Please discuss the intended indication with your doctor or pharmacist.",
                    "side_effects": "Mild stomach discomfort or headache can occur with many medications.",
                    "timing": orig.get("timing") or "Take exactly as directed by your prescribing physician.",
                }

    final_enriched = [e for e in enriched if e is not None]

    # Enrich each medication with official NIH RxNorm + US FDA authority metadata
    for med in final_enriched:
        mname = med.get("name", "")
        if not med.get("rxnorm"):
            rx_meta = get_rxnorm_drug_info(mname)
            if rx_meta:
                med["rxnorm"] = rx_meta
        if not med.get("fda_meta"):
            fda_info = get_fda_drug_warnings(mname)
            if fda_info:
                med["fda_meta"] = fda_info
        if not med.get("cdsco_india"):
            cdsco_info = get_cdsco_india_drug_info(mname)
            if cdsco_info:
                med["cdsco_india"] = cdsco_info

    return final_enriched
