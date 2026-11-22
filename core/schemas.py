"""Data models and schemas for MediLens."""

from __future__ import annotations

from typing import List, Optional
try:
    from pydantic import BaseModel, Field
except ImportError:
    # Graceful fallback if pydantic is not installed yet
    class BaseModel:
        def __init__(self, **data):
            for k, v in data.items():
                setattr(self, k, v)
        def model_dump(self):
            return {k: (v.model_dump() if hasattr(v, 'model_dump') else v) for k, v in self.__dict__.items()}
        def dict(self):
            return self.model_dump()
    def Field(default=None, **kwargs):
        return default


class TestItem(BaseModel):
    name: str = Field(description="Name of the diagnostic test")
    value: str = Field(description="Reported numeric or qualitative test value")
    unit: str = Field(default="", description="Measurement unit (e.g., mg/dL, mmol/L)")
    range: str = Field(default="", description="Reference range printed on the report")
    status: str = Field(default="normal", description="Flag: normal, high, low, or critical")
    explain: str = Field(default="", description="Plain-language 1-2 sentence explanation")


class ReportMeta(BaseModel):
    lab: str = Field(default="Unknown Diagnostic Center", description="Name of the laboratory")
    date: str = Field(default="Recent", description="Report date")
    patient: str = Field(default="Patient", description="Age, gender, or patient identifier")


class MedicineItem(BaseModel):
    name: str = Field(description="Name and strength of the prescribed medication")
    purpose: str = Field(default="", description="General health purpose of the drug")
    side_effects: str = Field(default="", description="Common, well-documented side effects")
    timing: str = Field(default="", description="Timing as indicated on the prescription")


class DoctorPrepData(BaseModel):
    questions: List[str] = Field(default_factory=list, description="5-7 targeted questions for doctor")
    bring: List[str] = Field(default_factory=list, description="Items/records patient should bring")


class ReportData(BaseModel):
    meta: ReportMeta = Field(default_factory=ReportMeta)
    tests: List[TestItem] = Field(default_factory=list)
    summary: str = Field(default="", description="Plain-language summary of results")
    medicines: List[MedicineItem] = Field(default_factory=list)

    def to_dict(self) -> dict:
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()
