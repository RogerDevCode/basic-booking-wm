#!/usr/bin/env bash
# sync-fast.sh — Sincronización quirúrgica y veloz para desarrollo
set -euo pipefail

WORKSPACE_ID="booking-titanium"

echo "⚡ Iniciando sincronización RÁPIDA..."

# 1. COMMIT LOCAL (Opcional)
if [ $# -gt 0 ]; then
  COMMIT_MSG="$1"
  git add -A
  git commit -m "fast: $COMMIT_MSG"
  echo "📝 Commit local realizado."
fi

# 2. PUSH INCREMENTAL A WINDMILL
echo "🔄 Regenerando metadatos..."
wmill generate-metadata --workspace "$WORKSPACE_ID" --yes

echo "🔄 Subiendo cambios a Windmill (Modo paralelo)..."
wmill sync push --workspace "$WORKSPACE_ID" --parallel 10 --yes

echo "✅ Sincronizado en segundos."
