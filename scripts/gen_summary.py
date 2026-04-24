#!/usr/bin/env python3
"""Generate .ai-codex/summary.md from Python AST — zero external deps."""
from __future__ import annotations
import ast
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from typing import NamedTuple

# ── Config ────────────────────────────────────────────────────────
SRC_DIRS = ["src", "f"]          # adjust to project layout
EXCLUDE  = {"__pycache__", ".venv", "node_modules", ".git", "dist", "build"}
OUT      = Path(".ai-codex")
OUT.mkdir(exist_ok=True)

class Sym(NamedTuple):
    kind: str   # "class" | "fn" | "async_fn"
    name: str
    line: int

def scan(path: Path) -> list[Sym]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return []
    syms: list[Sym] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and not node.name.startswith("_"):
            syms.append(Sym("class", node.name, node.lineno))
        elif isinstance(node, ast.AsyncFunctionDef) and not node.name.startswith("_"):
            syms.append(Sym("async_fn", node.name, node.lineno))
        elif isinstance(node, ast.FunctionDef) and not node.name.startswith("_"):
            syms.append(Sym("fn", node.name, node.lineno))
    return sorted(syms, key=lambda s: s.line)

# ── Git info ──────────────────────────────────────────────────────
try:
    rev = subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL
    ).decode().strip()
except Exception:
    rev = "unknown"

# ── Build output ─────────────────────────────────────────────────
lines: list[str] = [
    "# Codebase Index",
    f"_git:{rev} — {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M')}Z_\n",
    "> Read this file BEFORE exploring the repository.\n",
    "## Module Map\n",
]

found_files = 0
for src in SRC_DIRS:
    root = Path(src)
    if not root.exists():
        continue
    for py in sorted(root.rglob("*.py")):
        if any(p in EXCLUDE for p in py.parts):
            continue
        syms = scan(py)
        if not syms:
            continue
        found_files += 1
        lines.append(f"### `{py}`")
        for s in syms:
            icon = "📦" if s.kind == "class" else ("⚡" if s.kind == "async_fn" else "🔧")
            lines.append(f"- {icon} `{s.kind}` `{s.name}` (L{s.line})")
        lines.append("")

# ── Windmill scripts ──────────────────────────────────────────────
wm: list[str] = [
    f"- `{y}`"
    for y in sorted(Path(".").rglob("*.script.yaml"))
    if not any(p in EXCLUDE for p in y.parts)
]
if wm:
    lines += ["## Windmill Scripts\n"] + wm + [""]

# ── Write ─────────────────────────────────────────────────────────
(OUT / "summary.md").write_text("\n".join(lines))
print(f"✓ .ai-codex/summary.md — {found_files} modules, {len(wm)} Windmill scripts")
