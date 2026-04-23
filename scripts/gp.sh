#!/bin/bash
# gp.sh — Ultimate Push & Sync for Booking Titanium
# Gestiona Git (Force a origin/main) + Windmill Sync.

set -euo pipefail

# --- CONFIGURACIÓN ---
WORKSPACE_ID="booking-titanium"
ENV_FILE=".env"
TARGET_REMOTE="origin"
TARGET_BRANCH="main"

require_command() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1 || {
        echo "❌ Falta el comando requerido: $cmd"
        exit 1
    }
}

setup_remote() {
    [ ! -f "$ENV_FILE" ] && { echo "❌ Falta $ENV_FILE en $(pwd)"; exit 1; }
    
    # Acepta GIT_REMOTE_URL legacy o WM_GIT_REPO actual.
    local line=""
    line="$(
        awk -F= '
            /^GIT_REMOTE_URL=/ { sub(/^[^=]*=/, "", $0); print; exit }
            /^WM_GIT_REPO=/    { sub(/^[^=]*=/, "", $0); print; exit }
        ' "$ENV_FILE" | xargs || true
    )"

    [ -z "$line" ] && {
        echo "❌ Ni GIT_REMOTE_URL ni WM_GIT_REPO están definidas en $ENV_FILE"
        exit 1
    }

    GIT_REMOTE_URL="$line"
    echo "✅ Remoto configurado: $GIT_REMOTE_URL"
}

# --- VALIDACIONES INICIALES ---
[ -z "${1:-}" ] && { echo "❌ Uso: gp \"mensaje del commit\""; exit 1; }
COMMIT_MSG="$1"

! git rev-parse --git-dir > /dev/null 2>&1 && { echo "❌ No es un repositorio Git"; exit 1; }
require_command git

setup_remote

# --- CONFIGURACIÓN DE ORIGIN Y RAMA ---
# Asegurar que el remoto 'origin' apunte a la URL correcta
if git remote | grep -q "^$TARGET_REMOTE$"; then
    git remote set-url "$TARGET_REMOTE" "$GIT_REMOTE_URL"
    echo "🔄 URL de '$TARGET_REMOTE' sincronizada."
else
    git remote add "$TARGET_REMOTE" "$GIT_REMOTE_URL"
    echo "➕ Remoto '$TARGET_REMOTE' añadido."
fi

# --- FLUJO GIT ---
echo "📦 Preparando cambios para $TARGET_REMOTE/$TARGET_BRANCH..."
git add -A

if ! git diff-index --quiet HEAD --; then
    echo "📝 Creando commit: $COMMIT_MSG"
    git commit -m "$COMMIT_MSG"
else
    echo "⚠️  Sin cambios nuevos para commit."
fi

echo "🚀 Ejecutando push a $TARGET_REMOTE/$TARGET_BRANCH..."
git push "$TARGET_REMOTE" "HEAD:$TARGET_BRANCH"

# --- FLUJO WINDMILL ---
echo "🔄 Sincronizando con Windmill (Workspace: $WORKSPACE_ID)..."
if command -v wmill &> /dev/null; then
    wmill sync push --workspace "$WORKSPACE_ID" --parallel 20 --yes
    echo "✅ Windmill actualizado."
else
    echo "⚠️  wmill CLI no encontrada."
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 DESPLIEGUE EXITOSO EN ORIGIN/MAIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
