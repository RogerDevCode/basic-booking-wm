from __future__ import annotations

import importlib.resources
import os
import re
from typing import Final

from symspellpy import SymSpell, Verbosity  # type: ignore[import-untyped]

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
    "viene",
    "vienen",
    "oiga",
    "oye",
    "haga",
    "hagame",
    "dígame",
    "digame",
    "confirmame",
    # Common conversational words missing from dictionary
    "hola",
    "buenos",
    "buenas",
    "dias",
    "días",
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
    # Chilean health-system proper nouns + domain terms.
    "fonasa",
    "isapre",
    "isapres",
    "banmedica",
    "banmédica",
    "colmena",
    "consalud",
    "masvida",
    "vidatres",
    "redbanc",
    "webpay",
    "copago",
    "arancel",
    "reembolso",
    "boleta",
    "bono",
    "tramo",
    "samu",
    "telemedicina",
    "teleconsulta",
    "interconsulta",
    "ecografia",
    "ecografía",
    "hemograma",
    "glicemia",
    "dislipidemia",
    "kinesiologia",
    "kinesiología",
    "recordatorio",
    "recordatorios",
)

# Minimum word length for correction attempts; short words have high false-positive rate.
_MIN_WORD_LEN: Final[int] = 3

# Courtesy/medical titles. Provider surnames are dynamic (providers table) so a
# static allowlist can't cover them; instead we treat the word right after a
# title as a proper noun and never spell-correct it.
_TITLES: Final[frozenset[str]] = frozenset(
    {"dr", "dra", "doctor", "doctora", "don", "doña", "dona", "sr", "sra", "srta", "sta"}
)

# Module-level singleton — lazy-initialised on first call to avoid side-effects at import.
_sym_spell: SymSpell | None = None


from ..internal._wmill_adapter import log

MODULE: Final[str] = "spell_normalizer"


def _get_checker() -> SymSpell:
    global _sym_spell
    if _sym_spell is not None:
        return _sym_spell

    # max_dictionary_edit_distance=2 is standard.
    # prefix_length=7 is optimized for speed.
    sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)

    # Use importlib.resources to locate the dictionary file (works in Windmill sandbox where __file__ is unavailable).
    try:
        dict_resource = importlib.resources.files(__package__).joinpath("es_50k.txt")
        with importlib.resources.as_file(dict_resource) as dict_path:
            if os.path.exists(dict_path):
                sym_spell.load_dictionary(str(dict_path), term_index=0, count_index=1)
            else:
                log(
                    "CRITICAL_MISSING_DICTIONARY",
                    error="es_50k.txt not found. SymSpell running degraded.",
                    module=MODULE,
                )
    except Exception as e:
        log(
            "CRITICAL_MISSING_DICTIONARY",
            error=f"Failed to load es_50k.txt: {e}. SymSpell running degraded.",
            module=MODULE,
        )

    # Inject custom domain words with maximum frequency to ensure they win ties
    for word in _CUSTOM_WORDS:
        sym_spell.create_dictionary_entry(word, 99999999)

    _sym_spell = sym_spell
    return sym_spell


def apply_spell_correction(text: str) -> tuple[str, list[SpellCorrection]]:
    """Correct unknown Spanish words using SymSpell.

    Runs AFTER the modism map so Chilean slang is already resolved.
    Skips words shorter than _MIN_WORD_LEN to avoid false positives.
    """
    # Telegram commands (/start, /help, etc.) must pass through unchanged.
    if text.startswith("/"):
        return text, []

    checker = _get_checker()
    # Split into word tokens and non-word tokens (punctuation, spaces) to preserve structure.
    tokens = re.findall(r"\w+|\W+", text)
    corrections: list[SpellCorrection] = []
    result_parts: list[str] = []
    prev_word_lower: str | None = None

    for token in tokens:
        if not re.match(r"^\w+$", token):
            result_parts.append(token)
            continue

        word_lower = token.lower()
        prev = prev_word_lower
        prev_word_lower = word_lower

        # Proper-noun guard: a title (dr, doctora, …) and the word immediately
        # after it (the surname) are never spell-corrected.
        if word_lower in _TITLES or prev in _TITLES:
            result_parts.append(token)
            continue

        if len(word_lower) < _MIN_WORD_LEN:
            result_parts.append(token)
            continue

        # Lookup closest match within edit distance 2
        suggestions = checker.lookup(word_lower, Verbosity.CLOSEST, max_edit_distance=2)

        if not suggestions:
            result_parts.append(token)
            continue

        suggestion = suggestions[0].term

        if suggestion == word_lower:
            result_parts.append(token)
            continue

        corrections.append(SpellCorrection(original=token, corrected=suggestion))
        result_parts.append(suggestion)

    return "".join(result_parts), corrections
