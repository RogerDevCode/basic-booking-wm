from __future__ import annotations

from typing import Any


def _build_debug_message(
    webhook_trigger: dict[str, Any],
    preprocessor: dict[str, Any] | None,
) -> str:
    """Reproduce the JS expr logic from the branchall debug step."""
    raw: str = webhook_trigger.get("canonical_text") or ""
    cleaned: str = (preprocessor or {}).get("cleaned_text") or raw
    applied: str = "Sí" if (preprocessor or {}).get("normalization_applied") else "No"
    confidence: float = (preprocessor or {}).get("confidence", 1.0)

    modisms: list[dict[str, Any]] = (preprocessor or {}).get("modism_matches", [])
    modism_str = (
        "ninguno" if not modisms else ", ".join(f"{m['phrase']} → {m.get('canonical') or '∅'}" for m in modisms)
    )

    corrections: list[dict[str, Any]] = (preprocessor or {}).get("spell_corrections", [])
    corr_str = "ninguna" if not corrections else ", ".join(f"{c['original']} → {c['corrected']}" for c in corrections)

    return (
        f"🔬 *Preprocessor Debug*\n\n"
        f"📥 *Raw:* `{raw}`\n"
        f"✅ *Cleaned:* `{cleaned}`\n"
        f"🔄 *Applied:* {applied} | 📊 *Conf:* {confidence}\n\n"
        f"📌 *Modisms:* {modism_str}\n"
        f"✍️ *Corrections:* {corr_str}"
    )


# ── Tests ────────────────────────────────────────────────────────────────────


def test_debug_message_with_modisms_and_corrections() -> None:
    """Full debug output when preprocessor normalized the text."""
    result = _build_debug_message(
        webhook_trigger={"canonical_text": "kiero sacar hora pal viernes po"},
        preprocessor={
            "cleaned_text": "quiero hacer una cita para el viernes",
            "normalization_applied": True,
            "confidence": 1.0,
            "modism_matches": [
                {"phrase": "kiero", "canonical": "quiero"},
                {"phrase": "sacar hora", "canonical": "hacer una cita"},
                {"phrase": "pal", "canonical": "para el"},
                {"phrase": "po", "canonical": ""},
            ],
            "spell_corrections": [],
        },
    )
    assert "🔬 *Preprocessor Debug*" in result
    assert "📥 *Raw:* `kiero sacar hora pal viernes po`" in result
    assert "✅ *Cleaned:* `quiero hacer una cita para el viernes`" in result
    assert "🔄 *Applied:* Sí | 📊 *Conf:* 1.0" in result
    assert "📌 *Modisms:* kiero → quiero, sacar hora → hacer una cita, pal → para el, po → ∅" in result
    assert "✍️ *Corrections:* ninguna" in result


def test_debug_message_with_spell_corrections() -> None:
    """Debug output includes spell corrections when present."""
    result = _build_debug_message(
        webhook_trigger={"canonical_text": "voy al hospitl manana"},
        preprocessor={
            "cleaned_text": "voy al hospital mañana",
            "normalization_applied": True,
            "confidence": 0.85,
            "modism_matches": [],
            "spell_corrections": [
                {"original": "hospitl", "corrected": "hospital"},
                {"original": "manana", "corrected": "mañana"},
            ],
        },
    )
    assert "✍️ *Corrections:* hospitl → hospital, manana → mañana" in result
    assert "📌 *Modisms:* ninguno" in result
    assert "🔄 *Applied:* Sí | 📊 *Conf:* 0.85" in result


def test_debug_message_clean_input_no_change() -> None:
    """When input is clean, debug shows 'No' applied and empty modism/correction lists."""
    result = _build_debug_message(
        webhook_trigger={"canonical_text": "necesito cancelar mi cita del viernes"},
        preprocessor={
            "cleaned_text": "necesito cancelar mi cita del viernes",
            "normalization_applied": False,
            "confidence": 1.0,
            "modism_matches": [],
            "spell_corrections": [],
        },
    )
    assert "🔄 *Applied:* No | 📊 *Conf:* 1.0" in result
    assert "📌 *Modisms:* ninguno" in result
    assert "✍️ *Corrections:* ninguna" in result
    assert "✅ *Cleaned:* `necesito cancelar mi cita del viernes`" in result


def test_debug_message_missing_preprocessor() -> None:
    """If preprocessor step was skipped, fallback to raw canonical_text."""
    result = _build_debug_message(
        webhook_trigger={"canonical_text": "hello world"},
        preprocessor=None,
    )
    assert "✅ *Cleaned:* `hello world`" in result
    assert "🔄 *Applied:* No | 📊 *Conf:* 1.0" in result
    assert "📌 *Modisms:* ninguno" in result
    assert "✍️ *Corrections:* ninguna" in result


def test_debug_message_filler_modism_with_empty_canonical() -> None:
    """Filler modisms (canonical empty) display as ∅ in the debug output."""
    result = _build_debug_message(
        webhook_trigger={"canonical_text": "weon kiero hora po"},
        preprocessor={
            "cleaned_text": "quiero hora",
            "normalization_applied": True,
            "confidence": 1.0,
            "modism_matches": [
                {"phrase": "weon", "canonical": ""},
                {"phrase": "kiero", "canonical": "quiero"},
                {"phrase": "po", "canonical": ""},
            ],
            "spell_corrections": [],
        },
    )
    assert "weon → ∅" in result
    assert "po → ∅" in result
    assert "kiero → quiero" in result
