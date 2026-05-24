from __future__ import annotations

import re
import unicodedata

from ._preprocessor_models import SecurityScanResult

# 1. Prompt Injection Heuristics
# Focus on command overrides, identity manipulation, and system prompt extraction.
# Covers Spanish and English jailbreak patterns.
_PROMPT_INJECTION_PATTERNS = [
    # Spanish overrides
    r"\b(?:ignora|olvida|desestima|cancela)\b.*\b(?:instrucciones|reglas|prompt|anterior)\b",
    r"\b(?:eres|actua como|simula ser)\b.*\b(?:un|una)\b.*\b(?:bot|ia|asistente|humano)\b",
    r"\b(?:system prompt|developer prompt|system message)\b",
    r"\b(?:olvida todo|nuevo objetivo|nueva directiva)\b",
    # English jailbreak patterns (DAN, override, role-switch)
    r"\b(?:ignore|forget|disregard|override)\b.{0,40}\b(?:instructions?|rules?|prompt|previous|above)\b",
    r"\b(?:you are now|act as|pretend to be|roleplay as|simulate being|from now on you)\b",
    r"\b(?:jailbreak|dan mode|developer mode|god mode|unrestricted mode)\b",
    r"\b(?:new instruction|new directive|new goal|new objective|new persona)\b",
    r"\b(?:ignore all|forget all|disregard all)\b",
]

# 2. Command Injection & Path Traversal
# Focus on shell commands, paths, and execution operators.
_COMMAND_INJECTION_PATTERNS = [
    r"(?:\.\./\.\./|/etc/passwd|/bin/sh|/bin/bash|cmd\.exe|powershell)",
    r"(?:\$\(|`|;.*\||\|\||&&)",
    r"\b(?:curl|wget|nc|bash|sh|rm|del|chmod|chown)\s+-",
]

# 3. XSS (Cross-Site Scripting)
# Focus on encoded payloads, direct execution schemas, and event handlers.
# Note: Basic <script> tags are already handled by _text_cleaner.py removing HTML tags,
# but this catches more insidious vectors.
_XSS_PATTERNS = [
    r"(?:javascript:|vbscript:|data:text/html)",
    r"\b(?:onerror|onload|onclick|onmouseover|onfocus|onblur)\s*=",
]

# 4. SQL Injection (Legacy patterns)
# Using (?:\s+|/\*.*?\*/) to catch spaces or SQL inline comments e.g. DROP/**/TABLE
_SQL_PATTERNS = [
    r"\b(?:drop)(?:\s+|/\*.*?\*/)+(?:table|database|schema|view|index|user|role)\b",
    r"\b(?:delete)(?:\s+|/\*.*?\*/)+(?:from)\b",
    r"\b(?:truncate)(?:\s+|/\*.*?\*/)+(?:table)\b",
    r"\b(?:insert)(?:\s+|/\*.*?\*/)+(?:into)\b",
    r"\b(?:update)(?:\s+|/\*.*?\*/)+.*?(?:\s+|/\*.*?\*/)+(?:set)\b",
    r"\b(?:select)(?:\s+|/\*.*?\*/)+.*?(?:\s+|/\*.*?\*/)+(?:from)\b",
    r"\b(?:alter)(?:\s+|/\*.*?\*/)+(?:table|database|schema|user|role)\b",
    r"\b(?:grant)(?:\s+|/\*.*?\*/)+(?:all|select|insert|update|delete)\b",
    r"\b(?:revoke)(?:\s+|/\*.*?\*/)+(?:all|select|insert|update|delete)\b",
    r";\s*--",  # Stacked query followed by comment
    r"--\s*(?:drop|delete|select|insert|update|truncate|alter|grant|revoke)\b",  # Malicious comment
    r";\s*(?:drop|delete|truncate|update|insert|alter|grant|revoke)\b",  # Stacked queries
]

_COMPILED_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "prompt_injection": [re.compile(p, re.IGNORECASE) for p in _PROMPT_INJECTION_PATTERNS],
    "command_injection": [re.compile(p, re.IGNORECASE) for p in _COMMAND_INJECTION_PATTERNS],
    "xss": [re.compile(p, re.IGNORECASE) for p in _XSS_PATTERNS],
    "sql_injection": [re.compile(p, re.IGNORECASE) for p in _SQL_PATTERNS],
}


def scan_threats(text: str) -> tuple[str, SecurityScanResult]:
    """
    Scans for multiple threat vectors (SQLi, XSS, CMD, Prompt Injection).
    Returns: (censored_text, SecurityScanResult)
    """
    # NFKC Normalization inside the scanner to guarantee evasion immunity
    # regardless of where this function is called from.
    safe_text = unicodedata.normalize("NFKC", text)

    for threat_type, patterns in _COMPILED_PATTERNS.items():
        for pattern in patterns:
            if pattern.search(safe_text):
                # We censor the text to protect any underlying logging mechanisms
                safe_text = pattern.sub("[CENSURADO]", safe_text)

                # We return immediately on the first threat detected (Fail-Fast)
                return safe_text, SecurityScanResult(
                    threat_detected=True,
                    threat_type=threat_type,  # type: ignore
                )

    return safe_text, SecurityScanResult(threat_detected=False, threat_type="none")
