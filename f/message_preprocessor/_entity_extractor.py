from __future__ import annotations

import re
from typing import Final


from ._preprocessor_models import ExtractedEntities

URL_REGEX: Final[re.Pattern[str]] = re.compile(r"https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+")
# Basic Chilean phone matcher: +569 followed by 8 digits, or 9 followed by 8 digits
PHONE_REGEX: Final[re.Pattern[str]] = re.compile(r"(?:\+?56)?\s*9\s*\d{4}\s*\d{4}")
# Basic RUT matcher: 1-2 digits, followed by point (optional), 3 digits, point (optional), 3 digits, dash, 1 digit or K
RUT_REGEX: Final[re.Pattern[str]] = re.compile(r"\b(\d{1,2}(?:\.\d{3}){2}-[\dkK]|\d{7,8}-[\dkK])\b")

EMOJI_DICT: Final[dict[str, str]] = {
    "👍": "[aprobacion]",
    "👎": "[desaprobacion]",
    "😊": "[sonrisa]",
    "😂": "[risa]",
    "😔": "[tristeza]",
    "😡": "[enojo]",
    "🙏": "[por_favor]",
    "❌": "[cancelar]",
    "✅": "[confirmar]",
    "⏰": "[reloj]",
    "📅": "[calendario]",
    "📞": "[telefono]",
}


def _validate_rut(rut: str) -> bool:
    clean_rut = rut.replace(".", "").replace("-", "").upper()
    if len(clean_rut) < 8:
        return False
    body = clean_rut[:-1]
    dv = clean_rut[-1]
    if not body.isdigit():
        return False

    try:
        s = sum(int(d) * ((i % 6) + 2) for i, d in enumerate(reversed(body)))
        expected_dv = str((11 - (s % 11)) % 11)
        if expected_dv == "10":
            expected_dv = "K"
        return expected_dv == dv
    except Exception:
        return False


def extract_entities(text: str) -> tuple[str, ExtractedEntities]:
    entities = ExtractedEntities()

    # 1. URL extraction
    urls = URL_REGEX.findall(text)
    if urls:
        entities.urls = urls
        text = URL_REGEX.sub("[URL]", text)

    # 2. Phone extraction
    phones = PHONE_REGEX.findall(text)
    if phones:
        entities.phones = [p.replace(" ", "") for p in phones]
        text = PHONE_REGEX.sub("[TELEFONO]", text)

    # 3. RUT extraction
    ruts_raw = RUT_REGEX.findall(text)
    valid_ruts: list[str] = []
    for r in ruts_raw:
        if _validate_rut(r):
            valid_ruts.append(r)
            text = text.replace(r, "[RUT]")
    if valid_ruts:
        entities.ruts = valid_ruts

    # 4. Emoji replacement
    for emoji, desc in EMOJI_DICT.items():
        if emoji in text:
            text = text.replace(emoji, f" {desc} ")

    # Simple cleanup of extra spaces left by emoji replacement
    text = re.sub(r"\s+", " ", text).strip()

    return text, entities
