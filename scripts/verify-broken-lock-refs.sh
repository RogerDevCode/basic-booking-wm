#!/usr/bin/env bash
# verify-broken-lock-refs.sh — detecta y corrige referencias lock rotas en metadata Windmill
set -euo pipefail

MODE="check"
SCOPE="repo"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/verify-broken-lock-refs.sh [--check|--fix] [--repo|--files <file1,file2,...>]

Behavior:
  --check                Solo reporta referencias rotas.
  --fix                  Elimina lineas lock: '!inline ...' cuyo archivo no existe.
  --repo                 Escanea todo f/ (default).
  --files <csv>          Escanea solo los archivos YAML indicados.
EOF
}

FILES_CSV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check)
      MODE="check"
      ;;
    --fix)
      MODE="fix"
      ;;
    --repo)
      SCOPE="repo"
      ;;
    --files)
      shift
      FILES_CSV="${1:-}"
      SCOPE="files"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

export MODE SCOPE FILES_CSV

python3 - <<'EOF'
import os
import json
import re

mode = os.environ.get("MODE", "check")
scope = os.environ.get("SCOPE", "repo")
files_csv = os.environ.get("FILES_CSV", "")

def is_candidate(file_path):
    return file_path.endswith('.script.yaml') or file_path.endswith('.app.yaml') or file_path.endswith('/flow.yaml')

def get_candidates():
    if scope == 'files':
        return [f.strip() for f in files_csv.split(',') if f.strip() and os.path.exists(f.strip()) and is_candidate(f.strip())]
    
    candidates = []
    for root, _, files in os.walk('f'):
        for f in files:
            full_path = os.path.join(root, f)
            if is_candidate(full_path):
                candidates.append(full_path)
    return candidates

candidates = get_candidates()
broken = []
changed = 0

lock_pattern = re.compile(r"^lock: '!inline (.+)'$", re.MULTILINE)

for file_path in candidates:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    def replacer(match):
        lock_path = match.group(1)
        if os.path.exists(lock_path):
            return match.group(0)
        
        broken.append({"file": file_path, "lock": lock_path})
        if mode == 'fix':
            return ""
        return match.group(0)

    new_content = lock_pattern.sub(replacer, content)
    # Cleanup extra newlines if fixed
    if mode == 'fix':
        new_content = re.sub(r'\n{3,}', '\n\n', new_content)

    if mode == 'fix' and new_content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        changed += 1

if not broken:
    print(json.dumps({"ok": True, "changed": 0, "broken": 0}, indent=2))
    exit(0)

print(json.dumps({
    "ok": mode == 'fix',
    "changed": changed,
    "broken": len(broken),
    "sample": broken[:20]
}, indent=2))

if mode == 'check':
    exit(1)
EOF
