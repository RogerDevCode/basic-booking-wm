from __future__ import annotations

import re
from typing import Final

from ._preprocessor_models import ModismMatch

# Ordered longest-phrase-first so multi-word phrases match before their components.
# Each entry: (chilean_phrase, canonical_spanish)
# Empty canonical means filler word — removed from output.
#
# "ora" → "hora": "ora" IS a valid Spanish verb (orar), but in Chilean medical
# booking context it exclusively means "hora médica". pyspellchecker returns it as
# correct (valid vocab), so we handle it here deterministically with word boundaries.
_MODISMS: Final[tuple[tuple[str, str], ...]] = (
    # Multi-word phrases first
    ("sacar hora", "hacer una cita"),
    ("pedir hora", "solicitar cita"),
    ("tener hora", "tener cita"),
    ("dar hora", "dar cita"),
    ("hay hora", "hay disponibilidad"),
    ("al tiro", "de inmediato"),
    # Single-word slang / k-substitutions / typos
    ("kanselame", "cancélame"),
    ("kansela", "cancela"),
    ("kambiar", "cambiar"),
    ("konsulta", "consulta"),
    ("kiero", "quiero"),
    ("orita", "ahora"),
    # "ora" in this domain context always means "hora médica"
    ("ora", "hora"),
    ("sita", "cita"),
    ("truno", "turno"),
    ("bieres", "viernes"),
    ("vierne", "viernes"),
    ("lune", "lunes"),
    # ASCII substitute for ñ (common on non-Spanish keyboards)
    ("manana", "mañana"),
    # Preposition shorthand
    ("pal", "para el"),
    # Chilean fillers — removed (empty canonical)
    ("weon", ""),
    ("weón", ""),
    ("po", ""),
)


def apply_modism_map(text: str) -> tuple[str, list[ModismMatch]]:
    """Apply Chilean booking modisms deterministically. Phrase-level, case-insensitive."""
    matches: list[ModismMatch] = []
    result = text

    for phrase, canonical in _MODISMS:
        pattern = re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE)
        if not pattern.search(result):
            continue
        matches.append(ModismMatch(phrase=phrase, canonical=canonical))
        replacement = canonical if canonical else ""
        result = pattern.sub(replacement, result)

    # Collapse any spaces left by filler removal
    result = re.sub(r"\s+", " ", result).strip()
    return result, matches
