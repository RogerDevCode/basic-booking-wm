#!/usr/bin/env python3
"""
GEN_SUMMARY — Deterministic AI-Codex Generator
Principles: Idempotency, Determinism, Atomic Write
"""
from __future__ import annotations
import ast
from pathlib import Path
from typing import NamedTuple

# ── Config ────────────────────────────────────────────────────────
SRC_DIRS = ["f"]                 # Primary source directory
EXCLUDE  = {"__pycache__", ".venv", "node_modules", ".git", "dist", "build"}
SUMMARY_FILE = Path(".ai-codex/summary.md")

class Sym(NamedTuple):
    kind: str   # "class" | "fn" | "async_fn"
    name: str
    line: int

def scan(path: Path) -> list[Sym]:
    """Scans a file for public symbols using AST."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return []
    
    syms: list[Sym] = []
    for node in ast.walk(tree):
        # Only extract public symbols (no underscore prefix)
        if isinstance(node, ast.ClassDef) and not node.name.startswith("_"):
            syms.append(Sym("class", node.name, node.lineno))
        elif isinstance(node, ast.AsyncFunctionDef) and not node.name.startswith("_"):
            syms.append(Sym("async_fn", node.name, node.lineno))
        elif isinstance(node, ast.FunctionDef) and not node.name.startswith("_"):
            syms.append(Sym("fn", node.name, node.lineno))
    
    # Sort by line number within the file
    return sorted(syms, key=lambda s: s.line)

def generate_content() -> str:
    """Generates the Markdown content in memory."""
    lines: list[str] = [
        "# Codebase Index",
        "",
        "> Read this file BEFORE exploring the repository. Use it to map architecture to logic.",
        "",
        "## Module Map",
        ""
    ]

    total_modules = 0
    all_files: list[Path] = []
    
    for src in SRC_DIRS:
        root = Path(src)
        if not root.exists():
            continue
        all_files.extend(root.rglob("*.py"))

    # ORDENAMIENTO DETERMINISTA: Por path (POSIX)
    for py in sorted(all_files, key=lambda p: p.as_posix()):
        if any(p in EXCLUDE for p in py.parts):
            continue
        
        syms = scan(py)
        if not syms:
            continue
            
        total_modules += 1
        lines.append(f"### `{py.as_posix()}`")
        for s in syms:
            icon = "📦" if s.kind == "class" else ("⚡" if s.kind == "async_fn" else "🔧")
            lines.append(f"- {icon} `{s.kind}` `{s.name}` (L{s.line})")
        lines.append("")

    # ── Windmill scripts ──────────────────────────────────────────────
    wm_files = [
        y for y in Path(".").rglob("*.script.yaml")
        if not any(p in EXCLUDE for p in y.parts)
    ]
    
    # ORDENAMIENTO DETERMINISTA
    wm_sorted = sorted(wm_files, key=lambda p: p.as_posix())
    
    if wm_sorted:
        lines.append("## Windmill Scripts")
        lines.append("")
        for y in wm_sorted:
            lines.append(f"- `{y.as_posix()}`")
        lines.append("")

    return "\n".join(lines) + "\n"

def main() -> None:
    # 1. Crear directorio si no existe
    SUMMARY_FILE.parent.mkdir(exist_ok=True)

    # 2. Generar contenido en memoria
    new_content = generate_content()

    # 3. LECTURA PREVIA Y ESCRITURA ATÓMICA
    old_content = ""
    if SUMMARY_FILE.exists():
        old_content = SUMMARY_FILE.read_text(encoding="utf-8")

    if new_content != old_content:
        SUMMARY_FILE.write_text(new_content, encoding="utf-8")
        # Contar scripts para el log
        wm_count = len([l for l in new_content.splitlines() if ".script.yaml" in l])
        mod_count = len([l for l in new_content.splitlines() if l.startswith("### `f/")])
        print(f"✓ .ai-codex/summary.md updated — {mod_count} modules, {wm_count} scripts")
    else:
        print("✓ .ai-codex/summary.md up to date (no changes)")

if __name__ == "__main__":
    main()
