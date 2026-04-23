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

MODE="$MODE" SCOPE="$SCOPE" FILES_CSV="$FILES_CSV" node - <<'EOF'
const fs = require('fs');
const path = require('path');

const mode = process.env.MODE;
const scope = process.env.SCOPE;
const filesCsv = process.env.FILES_CSV ?? '';
const yamlExtensions = new Set(['.script.yaml', '.app.yaml']);

function isCandidate(filePath) {
  return filePath.endsWith('.script.yaml') || filePath.endsWith('.app.yaml') || filePath.endsWith('/flow.yaml');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (isCandidate(full)) out.push(full);
  }
  return out;
}

function getCandidates() {
  if (scope === 'files') {
    return filesCsv
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => fs.existsSync(item) && isCandidate(item));
  }
  return walk('f');
}

const candidates = getCandidates();
const broken = [];
let changed = 0;

for (const file of candidates) {
  const original = fs.readFileSync(file, 'utf8');
  let fileChanged = false;
  const updated = original.replace(/^lock: '!inline (.+)'$/mg, (match, lockPath) => {
    if (fs.existsSync(lockPath)) return match;
    broken.push({ file, lock: lockPath });
    if (mode === 'fix') {
      fileChanged = true;
      return '';
    }
    return match;
  }).replace(/\n{3,}/g, '\n\n');

  if (mode === 'fix' && fileChanged) {
    fs.writeFileSync(file, updated);
    changed += 1;
  }
}

if (broken.length === 0) {
  console.log(JSON.stringify({ ok: true, changed: 0, broken: 0 }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify({
  ok: mode === 'fix',
  changed,
  broken: broken.length,
  sample: broken.slice(0, 20),
}, null, 2));

if (mode === 'check') process.exit(1);
EOF
