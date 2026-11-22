"""Rule-based Flagger engine for medical lab reports.

Evaluates test values against printed reference intervals and standard fallback
ranges from reference_ranges.json. Marks 'normal', 'high', 'low', or 'critical'.
Sorts abnormal values first.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.medical_apis import get_medlineplus_info, get_icmr_guideline

_REF_RANGES_PATH = Path(__file__).parent.parent / "data" / "reference_ranges.json"
_ORDER = {"critical": 0, "high": 1, "low": 1, "normal": 2}


def _load_reference_db() -> Dict[str, Any]:
    if _REF_RANGES_PATH.exists():
        try:
            with open(_REF_RANGES_PATH, "r", encoding="utf-8") as f:
                return json.load(f).get("tests", {})
        except Exception:
            pass
    return {}


_REF_DB = _load_reference_db()


def _normalize_name(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]", "", name.lower())
    return cleaned


def find_standard_ref(test_name: str) -> Optional[Dict[str, Any]]:
    """Match a test name against standard reference database safely (no short-alias false positives)."""
    name_clean = _normalize_name(test_name)
    name_lower = test_name.lower().strip()

    # Pass 1: Exact normalized match on key or alias
    for key, data in _REF_DB.items():
        if _normalize_name(key) == name_clean:
            return data
        for alias in data.get("aliases", []):
            if _normalize_name(alias) == name_clean:
                return data

    # Pass 2: Whole-word or multi-char (>=4) substring match (longest alias first)
    best_match = None
    best_len = 0
    for key, data in _REF_DB.items():
        for alias in data.get("aliases", []):
            alias_norm = _normalize_name(alias)
            if not alias_norm:
                continue
            if len(alias_norm) <= 3:
                # Short acronyms (e.g. 'k+', 'hb', 'tg', 'bun', 'alt', 'ast', 'tsh', 'wbc', 'ldl', 'hdl')
                # MUST match as an isolated word boundary so 'k' never matches 'CKD-EPI'!
                pattern = rf"(?<![a-z0-9]){re.escape(alias.lower())}(?![a-z0-9])"
                if re.search(pattern, name_lower) and len(alias_norm) > best_len:
                    best_match = data
                    best_len = len(alias_norm)
            else:
                # For multi-word/long aliases, require whole word boundary or matching token
                # Never match short tokens (like 'ar') inside long alias words (like 'aspartate')!
                if alias_norm in name_clean:
                    if len(alias_norm) > best_len:
                        best_match = data
                        best_len = len(alias_norm)
                elif len(name_clean) >= 4 and name_clean in alias_norm:
                    pattern = rf"(?<![a-z0-9]){re.escape(name_lower)}(?![a-z0-9])"
                    if re.search(pattern, alias.lower()) and len(alias_norm) > best_len:
                        best_match = data
                        best_len = len(alias_norm)
    return best_match


def parse_numeric(val: Any) -> Optional[float]:
    """Extract float from value string like '8.2', '162 mg/dL', ' 6.6 '."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    match = re.search(r"[-+]?\d*\.?\d+", str(val).replace(",", ""))
    if match:
        try:
            return float(match.group(0))
        except ValueError:
            return None
    return None


def parse_range_bounds(range_str: str) -> Tuple[Optional[float], Optional[float]]:
    """Parse range text into (min_val, max_val).
    
    Handles:
    '70 - 99', '4.0 – 5.6', '13.0 to 17.0', '< 100', '<= 150', '> 40', '>= 40'
    """
    if not range_str:
        return None, None
    s = range_str.strip().lower()
    s = s.replace("–", "-").replace("—", "-").replace("to", "-")

    # Less than (< 100)
    less_match = re.search(r"(?:<|<=|less than|up to)\s*([\d.]+)", s)
    if less_match:
        try:
            return None, float(less_match.group(1))
        except ValueError:
            pass

    # Greater than (> 40)
    greater_match = re.search(r"(?:>|>=|greater than|more than)\s*([\d.]+)", s)
    if greater_match:
        try:
            return float(greater_match.group(1)), None
        except ValueError:
            pass

    # Two-sided interval (70 - 99)
    interval_match = re.search(r"([\d.]+)\s*-\s*([\d.]+)", s)
    if interval_match:
        try:
            return float(interval_match.group(1)), float(interval_match.group(2))
        except ValueError:
            pass

    return None, None


def evaluate_test(test: Dict[str, Any]) -> Dict[str, Any]:
    """Decide whether a test value is out of range, assign status & default explanation."""
    name = test.get("name", "").strip()
    val_num = parse_numeric(test.get("value"))
    printed_range = test.get("range", "").strip()
    ref_info = find_standard_ref(name)

    # 1. Determine min and max range bounds
    min_bound, max_bound = parse_range_bounds(printed_range)

    # If the reference database has BOTH min AND max explicitly, trust it over the LLM-extracted
    # printed range — this prevents hallucinated ranges (e.g., "< 40" for Atrial Rate) from
    # incorrectly flagging well-known parameters like ECG measurements.
    if ref_info and ref_info.get("min") is not None and ref_info.get("max") is not None:
        min_bound = ref_info["min"]
        max_bound = ref_info["max"]
        # Always display the authoritative range string for recognized tests
        if ref_info.get("range_str"):
            test["range"] = ref_info["range_str"]
    elif min_bound is None and max_bound is None and ref_info:
        # Partial fallback: ref_info has only one-sided bound or range_str
        ref_min = ref_info.get("min")
        ref_max = ref_info.get("max")
        if ref_min is not None:
            min_bound = ref_min
        if ref_max is not None:
            max_bound = ref_max
        if not printed_range and ref_info.get("range_str"):
            test["range"] = ref_info["range_str"]

    if not test.get("unit") and ref_info and ref_info.get("unit"):
        test["unit"] = ref_info["unit"]

    # 2. Check qualitative values if non-numeric
    if val_num is None:
        val_str = str(test.get("value", "")).lower()

        # Clinical keywords identifying abnormal qualitative findings (ECG structural/electrical abnormalities, pathology, etc.)
        ABNORMAL_QUALITATIVE_TERMS = [
            "positive", "reactive", "abnormal", "detected",
            "hypertrophy", "enlargement", "bundle branch block", "lbbb", "rbbb",
            "st/t", "st segment", "t wave changes", "ischemia", "infarction",
            "tachycardia", "bradycardia", "fibrillation", "flutter", "arrhythmia",
            "cardiomegaly", "effusion", "consolidation", "infiltrate", "stenosis"
        ]

        is_abnormal = any(term in val_str for term in ABNORMAL_QUALITATIVE_TERMS)

        if is_abnormal:
            test["status"] = "high"
            test["direction"] = "high"

            # Plain-language explanation for cardiac / ECG narrative abnormalities
            if any(k in val_str for k in ["hypertrophy", "enlargement", "bundle branch", "st/t", "wave"]):
                test["what_it_is"] = test.get("what_it_is") or (
                    "Indicates structural enlargement (such as heart muscle wall thickening or chamber dilation) "
                    "or conduction delay in your heart's electrical system."
                )
                test["impact"] = test.get("impact") or (
                    "Findings like Left Ventricular Hypertrophy (LVH), Left Atrial Enlargement (LAE), or bundle branch delay "
                    "commonly reflect increased cardiac workload, often seen with sustained high blood pressure. "
                    "A physician review, blood pressure profiling, and an echocardiogram are recommended for full clinical correlation."
                )
            else:
                test["what_it_is"] = test.get("what_it_is") or f"{name} is a qualitative clinical finding."
                test["impact"] = test.get("impact") or f"Reported as non-standard or out of usual range ({val_str[:70]}). Please review with your doctor."

            if not test.get("explain"):
                test["explain"] = f"{test['what_it_is']} {test['impact']}"

            # Attach official health guides
            if not test.get("official_guide"):
                guide = get_medlineplus_info(name) or get_medlineplus_info("electrocardiogram")
                if guide:
                    test["official_guide"] = guide

            if not test.get("icmr_guide"):
                icmr = get_icmr_guideline("hypertrophy" if "hypertrophy" in val_str else name)
                if icmr:
                    test["icmr_guide"] = icmr

            return test
        else:
            test["status"] = "normal"
            test["direction"] = "normal"
            return test

    # 3. Determine status (normal, high, low) and direction
    status = "normal"
    direction = "normal"
    if min_bound is not None and val_num < min_bound:
        status = "low"
        direction = "low"
    elif max_bound is not None and val_num > max_bound:
        status = "high"
        direction = "high"

    # 4. Check critical thresholds table (ONLY when value is actually outside printed normal bounds!)
    crit_low = ref_info.get("critical_low") if ref_info else None
    crit_high = ref_info.get("critical_high") if ref_info else None

    name_norm = _normalize_name(name)
    if "potassium" in name_norm:
        crit_low = crit_low or 2.8
        crit_high = crit_high or 6.0
    elif "glucose" in name_norm or "sugar" in name_norm:
        crit_low = crit_low or 50.0
        crit_high = crit_high or 350.0
    elif "haemoglobin" in name_norm or "hemoglobin" in name_norm:
        crit_low = crit_low or 7.0
        crit_high = crit_high or 20.0
    elif "platelet" in name_norm:
        crit_low = 50000.0 if val_num > 1000 else 50.0
    elif "sodium" in name_norm:
        crit_low = crit_low or 120.0
        crit_high = crit_high or 160.0
    elif "calcium" in name_norm:
        crit_low = crit_low or 6.5
        crit_high = crit_high or 13.0
    elif "creatinine" in name_norm:
        crit_high = crit_high or 3.5
    elif "egfr" in name_norm or "glomerularfiltration" in name_norm:
        crit_low = crit_low or 20.0

    # Safety guard: if the printed range explicitly says the value is normal, never falsely upgrade to critical
    if status != "normal" or (min_bound is None and max_bound is None):
        if crit_low is not None and val_num <= crit_low:
            status = "critical"
            direction = "low"
        elif crit_high is not None and val_num >= crit_high:
            status = "critical"
            direction = "high"

    test["status"] = status
    test["direction"] = direction

    # 5. Populate structured plain-language "what_it_is" + "impact" + combined "explain"
    what_it_is = (ref_info.get("what_it_is") if ref_info else "") or (
        f"{name} is a clinical marker measured in this report to assess organ and metabolic health."
    )

    if status == "normal":
        impact = "Currently within the expected reference range, which is a reassuring healthy finding."
    elif direction == "low":
        base_impact = (ref_info.get("explanation_low") if ref_info else "") or (
            f"Being below the usual range ({test.get('range', 'reference limits')}) can indicate a deficiency or reduced organ function worth reviewing with your doctor."
        )
        impact = (
            f"{base_impact} Because this level is critically low, prompt medical evaluation is recommended."
            if status == "critical" and "prompt" not in base_impact.lower() and "urgent" not in base_impact.lower()
            else base_impact
        )
    else:
        base_impact = (ref_info.get("explanation_high") if ref_info else "") or (
            f"Being above the usual range ({test.get('range', 'reference limits')}) can signal added strain or inflammation that should be reviewed with your doctor."
        )
        impact = (
            f"{base_impact} Because this level is critically elevated, prompt medical evaluation is recommended."
            if status == "critical" and "prompt" not in base_impact.lower() and "urgent" not in base_impact.lower()
            else base_impact
        )

    test["what_it_is"] = test.get("what_it_is") or what_it_is
    test["impact"] = test.get("impact") or impact

    # Attach official NIH MedlinePlus Guide link & summary for credible patient education
    if status != "normal" and not test.get("official_guide"):
        guide = get_medlineplus_info(name)
        if guide:
            test["official_guide"] = guide

    # Attach ICMR (Indian Council of Medical Research) Guideline for Indian clinical reference
    if status != "normal" and not test.get("icmr_guide"):
        icmr = get_icmr_guideline(name)
        if icmr:
            test["icmr_guide"] = icmr

    if not test.get("explain"):
        if status == "normal":
            test["explain"] = ""
        else:
            test["explain"] = f"{test['what_it_is']} {test['impact']}"

    return test


def flag_report(tests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Flag all tests in a report and sort abnormal tests first."""
    processed = [evaluate_test(dict(t)) for t in tests]
    processed.sort(key=lambda t: _ORDER.get(t.get("status", "normal"), 2))
    return processed
