#!/usr/bin/env bash
# gen-codex-index.sh — Genera .ai-codex/index.md con misión y exports reales por módulo
# Uso: bash scripts/gen-codex-index.sh   (desde raíz del repo)
# Llamado automáticamente por .git/hooks/post-commit cuando f/ cambia

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
F_DIR="$REPO_ROOT/f"
OUTPUT="$REPO_ROOT/.ai-codex/index.md"
mkdir -p "$REPO_ROOT/.ai-codex"

# Extrae "Mission : ..." del comentario PRE-FLIGHT
get_mission() {
  grep -m1 'Mission\s*:' "$1" 2>/dev/null \
    | sed 's/.*Mission\s*:\s*//' | sed 's/\s*\*\///' | xargs 2>/dev/null || true
}

# Extrae firmas de exports públicos (primeras 8, sin cuerpo)
get_exports() {
  grep -n '^export ' "$1" 2>/dev/null \
    | grep -v '^[0-9]*:\s*//' \
    | sed 's/{.*//' | sed 's/=.*//' | sed 's/:\s*{.*//' \
    | sed 's/[[:space:]]*$//' \
    | head -8 \
    | awk -F: '{ line=$2; for(i=3;i<=NF;i++) line=line":"$i; print "  - `" line "`" }' \
    || true
}

# ─── HEADER ──────────────────────────────────────────────────────────────────
cat > "$OUTPUT" <<HEADER
# Codebase Index — booking-titanium-wm

> Auto-generado por \`scripts/gen-codex-index.sh\`. No editar manualmente.
> Última actualización: $(date -u '+%Y-%m-%d %H:%M UTC')

**Guías relacionadas:** \`.ai-codex/feature-map.md\` · \`.ai-codex/lib.md\` · \`.ai-codex/schema.md\`

---

HEADER

# ─── POR MÓDULO ──────────────────────────────────────────────────────────────
SKIP_DIRS="flows gemini_test openrouter_benchmark"

for dir in "$F_DIR"/*/; do
  mod="$(basename "$dir")"

  # Saltar carpetas excluidas
  skip=0
  for s in $SKIP_DIRS; do [[ "$mod" == "$s" ]] && skip=1 && break; done
  [[ $skip -eq 1 ]] && continue

  mission=""
  main_ts="$dir/main.ts"
  [[ -f "$main_ts" ]] && mission="$(get_mission "$main_ts")"

  printf '### `%s/`\n' "$mod" >> "$OUTPUT"
  [[ -n "$mission" ]] && printf '> %s\n\n' "$mission" >> "$OUTPUT" || printf '\n' >> "$OUTPUT"

  # Por cada .ts en el módulo (no tests, no locks, profundidad 2)
  while IFS= read -r tsfile; do
    basename_ts="$(basename "$tsfile")"
    exports="$(get_exports "$tsfile")"
    if [[ -n "$exports" ]]; then
      printf '**`%s`**\n%s\n\n' "$basename_ts" "$exports" >> "$OUTPUT"
    fi
  done < <(find "$dir" -maxdepth 2 -name "*.ts" \
             -not -name "*.test.ts" -not -name "*.spec.ts" \
             -not -name "*.lock" | sort)

done

# ─── FOOTER ──────────────────────────────────────────────────────────────────
total_mods=$(find "$F_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | xargs)
total_ts=$(find "$F_DIR" -name "*.ts" -not -name "*.test.ts" -not -name "*.lock" | wc -l | xargs)
printf '\n---\n\n**Stats:** %s módulos | %s archivos TypeScript (excl. tests)\n' \
  "$total_mods" "$total_ts" >> "$OUTPUT"

lines=$(wc -l < "$OUTPUT" | xargs)
bytes=$(wc -c < "$OUTPUT" | xargs)
echo "✓ Index generado: $OUTPUT ($lines líneas, $bytes bytes)"
