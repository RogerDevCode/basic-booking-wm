# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "pydantic>=2.10.0",
#   "beartype>=0.19.0",
#   "pyspellchecker>=0.8.0",
# ]
# ///
from __future__ import annotations

from typing import Any

from beartype import beartype

from ._modism_mapper import apply_modism_map
from ._preprocessor_models import PreprocessorInput, PreprocessorOutput
from ._spell_normalizer import apply_spell_correction
from ._text_cleaner import clean_text


@beartype
def _preprocess(raw_text: str) -> PreprocessorOutput:
    # Stage 1: strip control/invisible chars, collapse whitespace
    working = clean_text(raw_text)

    # Stage 2: Chilean modism map — deterministic, phrase-first, runs before spell check
    # to prevent pyspellchecker from mangling Chilean slang (e.g. kiero→fiero instead of quiero)
    working, modism_matches = apply_modism_map(working)

    # Stage 3: generic Spanish spell correction on residual unknown words
    working, spell_corrections = apply_spell_correction(working)

    # Final whitespace pass (filler removals may leave gaps)
    cleaned_text = clean_text(working)

    normalization_applied = bool(modism_matches or spell_corrections)

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
    )


def main(data: dict[str, Any]) -> dict[str, Any]:
    import asyncio

    async def _run() -> dict[str, Any]:
        validated = PreprocessorInput.model_validate(data)
        result = _preprocess(validated.raw_text)
        output: dict[str, Any] = result.model_dump()
        return output

    return asyncio.run(_run())
