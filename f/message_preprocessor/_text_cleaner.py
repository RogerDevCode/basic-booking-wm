from __future__ import annotations

import re
import unicodedata

# Unicode categories to strip: control chars (Cc) and format chars (Cf, e.g. zero-width joiners, RTL markers)
_STRIP_CATEGORIES: frozenset[str] = frozenset({"Cc", "Cf"})


def _remove_invisible_chars(text: str) -> str:
    return "".join(c for c in text if unicodedata.category(c) not in _STRIP_CATEGORIES)


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def clean_text(text: str) -> str:
    # Collapse whitespace FIRST so tabs/newlines become spaces instead of being
    # discarded by _remove_invisible_chars (which strips all Cc/Cf chars).
    working = _collapse_whitespace(text)
    working = _remove_invisible_chars(working)
    return _collapse_whitespace(working)
