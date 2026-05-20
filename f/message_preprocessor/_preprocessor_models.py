from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

from ..nlu._datetime_resolver import ResolverResult  # noqa: TC001


class SpellCorrection(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    original: str
    corrected: str


class ModismMatch(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    phrase: str
    canonical: str


class SecurityScanResult(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    threat_detected: bool = False
    threat_type: Literal["sql_injection", "xss", "command_injection", "prompt_injection", "none"] = "none"


class PreprocessorInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    raw_text: str


class PreprocessorOutput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    raw_text: str
    cleaned_text: str
    normalization_applied: bool
    spell_corrections: list[SpellCorrection]
    modism_matches: list[ModismMatch]
    confidence: float
    datetime_resolution: ResolverResult | None = None
    security_scan: SecurityScanResult
