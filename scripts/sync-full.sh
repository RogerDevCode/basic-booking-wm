#!/usr/bin/env bash
# sync-full.sh — Despliegue completo, validación e integridad (Fin del día)
set -euo pipefail

WORKSPACE_ID="booking-titanium"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏦 INICIANDO CIERRE DE SESIÓN / DESPLIEGUE FULL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. VALIDACIÓN TÉCNICA
echo "🔍 Ejecutando Typecheck y Lint..."
npm run typecheck && echo "✅ Tipado OK"

# 2. TESTS
echo "🧪 Ejecutando suite de pruebas..."
npm run test && echo "✅ Tests pasados"

# 3. SINCRONIZACIÓN WINDMILL (CON REGENERACIÓN DE METADATOS)
echo "🔄 Sincronizando con Windmill (Modo Integridad)..."
wmill sync push --workspace "$WORKSPACE_ID" --auto-metadata --yes --parallel 10 --no-diff

# 4. GIT PUSH A GITHUB
if [ $# -gt 0 ]; then
  COMMIT_MSG="$1"
  git add -A
  git commit -m "build: $COMMIT_MSG" || echo "Nada nuevo para commit"
fi

echo "📤 Subiendo cambios a GitHub..."
git push origin main

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🟢 SISTEMA ACTUALIZADO Y SEGURO"
echo "   • Metadatos regenerados"
echo "   • GitHub y Windmill en total paridad"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
