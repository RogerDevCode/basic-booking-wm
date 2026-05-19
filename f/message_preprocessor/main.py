# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "pydantic>=2.10.0",
#   "beartype>=0.19.0",
#   "symspellpy>=6.9.0",
#   "rapidfuzz>=3.5.2",
#   "jellyfish>=1.0.3",
#   "dateparser>=1.2.0"
# ]
# ///
from __future__ import annotations

from typing import Any

from beartype import beartype

from ..nlu._datetime_resolver import resolve_datetime
from ._modism_mapper import apply_modism_map
from ._preprocessor_models import PreprocessorInput, PreprocessorOutput
from ._spell_normalizer import apply_spell_correction
from ._text_cleaner import clean_text
from ._threat_scanner import scan_threats


@beartype
def _preprocess(raw_text: str) -> PreprocessorOutput:
    # Stage 1: strip control/invisible chars, collapse whitespace
    working = clean_text(raw_text)

    # Stage 1.5: Multi-Threat Heuristic Scan (SQLi, XSS, Cmd, Prompt Injection)
    working, security_scan = scan_threats(working)

    # Stage 2: Chilean modism map — deterministic, phrase-first, runs before spell check
    # to prevent pyspellchecker from mangling Chilean slang (e.g. kiero→fiero instead of quiero)
    working, modism_matches = apply_modism_map(working)

    # Stage 3: generic Spanish spell correction on residual unknown words
    working, spell_corrections = apply_spell_correction(working)

    # Final whitespace pass (filler removals may leave gaps)
    cleaned_text = clean_text(working)

    normalization_applied = bool(modism_matches or spell_corrections)

    # Stage 4: Resolve datetime intention using the hybrid pipeline
    dt_res = resolve_datetime(cleaned_text)

    # Confidence: 1.0 when no spell corrections needed; each correction reduces it.
    # Modism matches do not penalise confidence — they are deterministic and expected.
    word_count = max(len(raw_text.split()), 1)
    penalty = len(spell_corrections) / word_count * 0.3
    confidence = round(max(0.5, 1.0 - penalty), 3)

    return PreprocessorOutput(
        raw_text=raw_text,
        cleaned_text=cleaned_text,
        normalization_applied=normalization_applied,
        spell_corrections=spell_corrections,
        modism_matches=modism_matches,
        confidence=confidence,
        datetime_resolution=dt_res,
        security_scan=security_scan,
    )


def main(data: dict[str, Any]) -> dict[str, Any]:
    import asyncio

    async def _run() -> dict[str, Any]:
        validated = PreprocessorInput.model_validate(data)
        result = _preprocess(validated.raw_text)
        output: dict[str, Any] = result.model_dump()
        return output

    return asyncio.run(_run())
