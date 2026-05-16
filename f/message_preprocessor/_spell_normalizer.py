from __future__ import annotations

import re
from typing import Final

from spellchecker import SpellChecker

from ._preprocessor_models import SpellCorrection

# Words loaded into the Spanish checker to prevent false corrections.
# pyspellchecker's ES dictionary only contains infinitive/base forms — it flags
# common conjugations (quiero, necesito, puedo, tiene) as unknown and suggests
# incorrect replacements. This list covers conversational booking vocabulary.
_CUSTOM_WORDS: Final[tuple[str, ...]] = (
    # Verb conjugations absent from pyspellchecker ES dictionary
    "quiero",
    "quieres",
    "queremos",
    "quisiera",
    "quisiero",
    "necesito",
    "necesitas",
    "necesitamos",
    "puedo",
    "puedes",
    "podemos",
    "podría",
    "podrias",
    "tengo",
    "tienes",
    "tiene",
    "tenemos",
    "debo",
    "debes",
    "debemos",
    "oiga",
    "oye",
    "haga",
    "hagame",
    "dígame",
    "digame",
    "confirmame",
    # Common conversational words missing from dictionary
    "gracias",
    "favor",
    "posible",
    # Unaccented forms users type on non-Spanish keyboards
    "sabado",
    "miercoles",
    "proxima",
    "proximas",
    "proximos",
    # Medical booking domain vocabulary
    "agendar",
    "cancelar",
    "cancelarme",
    "reagendar",
    "reprogramar",
    "disponibilidad",
    "agenda",
    "turno",
    "consulta",
    "médico",
    "médica",
    "doctor",
    "doctora",
    "cita",
    "hora",
    "reserva",
    "especialista",
    "próximo",
    "próxima",
    "urgente",
    "urgentes",
    # Canonical outputs from modism map (so spell check doesn't re-mangle them)
    "inmediato",
    "inmediata",
    "inmediatos",
    "solicitar",
    "cancélame",
)

# Minimum word length for correction attempts; short words have high false-positive rate.
_MIN_WORD_LEN: Final[int] = 3

# Module-level singleton — lazy-initialised on first call to avoid side-effects at import.
_checker: SpellChecker | None = None


def _get_checker() -> SpellChecker:
    global _checker
    if _checker is not None:
        return _checker
    instance = SpellChecker(language="es")
    instance.word_frequency.load_words(_CUSTOM_WORDS)
    _checker = instance
    return instance


def apply_spell_correction(text: str) -> tuple[str, list[SpellCorrection]]:
    """Correct unknown Spanish words using pyspellchecker.

    Runs AFTER the modism map so Chilean slang is already resolved.
    Only corrects words flagged as unknown by the Spanish dictionary.
    Skips words shorter than _MIN_WORD_LEN to avoid false positives.
    """
    # Telegram commands (/start, /help, etc.) must pass through unchanged.
    # The Spanish dictionary would mangle English words like "start" → "estar".
    if text.startswith("/"):
        return text, []

    checker = _get_checker()
    # Split into word tokens and non-word tokens (punctuation, spaces) to preserve structure.
    tokens = re.findall(r"\w+|\W+", text)
    corrections: list[SpellCorrection] = []
    result_parts: list[str] = []

    for token in tokens:
        if not re.match(r"^\w+$", token):
            result_parts.append(token)
            continue

        word_lower = token.lower()

        if len(word_lower) < _MIN_WORD_LEN:
            result_parts.append(token)
            continue

        unknown = checker.unknown([word_lower])
        if not unknown:
            result_parts.append(token)
            continue

        suggestion = checker.correction(word_lower)
        if suggestion is None or suggestion == word_lower:
            result_parts.append(token)
            continue

        corrections.append(SpellCorrection(original=token, corrected=suggestion))
        result_parts.append(suggestion)

    return "".join(result_parts), corrections
