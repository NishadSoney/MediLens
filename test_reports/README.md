# MediLens Test Reports Suite (8 Reports)

Synthetic, hospital-grade PDF medical reports designed to benchmark MediLens across four clinical complexity tiers. All reports contain clean selectable text, structured reference ranges, clinical remarks, and prescriptions for end-to-end testing of extraction, flagging, AI Q&A, doctor prep, and drug education.

---

## Easy Reports (2)
| File | Patient / Scenario | Key Findings |
| :--- | :--- | :--- |
| `01_easy_annual_wellness_cbc.pdf` | Routine Annual Wellness CBC & Vitamins (28F) | Normal CBC & fasting glucose; mild Vitamin D (22 ng/mL) and borderline low Ferritin (14 ng/mL). 2 supplements. |
| `02_easy_lipid_thyroid_screening.pdf` | Preventive Lipid & Thyroid Check (36M) | Normal TSH/Free T4; mild dyslipidemia (Total Cholesterol 228, LDL 152, Triglycerides 165). 1 statin. |

## Intermediate Reports (2)
| File | Patient / Scenario | Key Findings |
| :--- | :--- | :--- |
| `03_intermediate_metabolic_liver_panel.pdf` | Type 2 Diabetes + Fatty Liver + Early Nephropathy (52M) | Elevated HbA1c (8.4%), glucose, ALT/AST/GGT, triglycerides, low HDL, and early microalbuminuria (uACR 48 mg/g) with preserved eGFR. 4 medications. |
| `04_intermediate_autoimmune_thyroid_anemia.pdf` | Hashimoto's Hypothyroidism + Macrocytic B12 Anemia (41F) | High TSH (14.8), low FT4/FT3, high Anti-TPO (412), low Hb (9.6) with **high MCV (106.4 fL)** and low B12 (138) despite normal ferritin. Timing-sensitive Levothyroxine regimen. |

## Extremely Hard Reports (2)
| File | Patient / Scenario | Key Findings |
| :--- | :--- | :--- |
| `05_hard_cardiorenal_electrolyte_crisis.pdf` | Stage 4-5 CKD + HFrEF + Hyperkalemia + Acidosis (68M) | **Multiple critical values:** Potassium 6.3 mmol/L, eGFR 16, Creatinine 3.8, Arterial pH 7.29, HCO3- 16, NT-proBNP 4,850, CKD-MBD (high phosphorus/iPTH, low calcium), and high-risk drug-lab interactions (Spironolactone + Ramipril). |
| `06_hard_complex_hematology_rheum_sepsis.pdf` | Severe Pancytopenia + SLE Flare vs. Secondary HLH / Sepsis (59F) | **Multiple critical values:** Pancytopenia (WBC 2.1, ANC 0.8, Hb 7.8, Platelets 48), extreme Ferritin (6,420 ng/mL), DIC coagulopathy (Fibrinogen 118, D-Dimer 3,850, INR 1.8), low C3/C4, ANA 1:640, Anti-dsDNA 185, elevated Procalcitonin (2.4). |

## Special Reports (2) — CT Scan, X-Ray & Surgery
| File | Modality / Scenario | Key Findings |
| :--- | :--- | :--- |
| `07_special_ct_scan_and_chest_xray_report.pdf` | **Contrast CT Abdomen/Pelvis + Digital Chest X-Ray** (47M) | Acute calculous appendicitis (11.4 mm dilated appendix, 3.8 mm wall thickening, 6.5 mm obstructing appendicolith, periappendiceal fat stranding), incidental 1.8 cm simple liver cyst & 3.2 mm renal stone; Chest X-Ray normal (CTR 0.46, no free subdiaphragmatic air); pre-op labs & IV antibiotics. |
| `08_special_surgery_operative_discharge_report.pdf` | **Surgery Operative Note, Histopathology & Discharge Summary** (55F) | Laparoscopic Cholecystectomy + Intra-Operative Cholangiogram (normal 5.4 mm CBD, no retained stones, Critical View of Safety achieved, 18 mm impacted stone) + Umbilical Hernia Repair; benign histopathology; post-op labs, discharge meds, and emergency red-flag instructions. |
