from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SpellCorrection(BaseModel):
    model_config = ConfigDict(strict=True)

    original: str
    corrected: str


class ModismMatch(BaseModel):
    model_config = ConfigDict(strict=True)

    phrase: str
    canonical: str


class PreprocessorInput(BaseModel):
    model_config = ConfigDict(strict=True)

    raw_text: str


class PreprocessorOutput(BaseModel):
    model_config = ConfigDict(strict=True)

    raw_text: str
    cleaned_text: str
    normalization_applied: bool
    spell_corrections: list[SpellCorrection]
    modism_matches: list[ModismMatch]
    confidence: float
