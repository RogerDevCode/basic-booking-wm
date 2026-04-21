#!/bin/bash
# gp.sh — Ultimate Push & Sync for Booking Titanium
# Gestiona Git (Force a origin/main) + Windmill Sync.

set -euo pipefail

# --- CONFIGURACIÓN ---
WORKSPACE_ID="booking-titanium"
ENV_FILE=".env"
TARGET_REMOTE="origin"
TARGET_BRANCH="main"

setup_remote() {
    [ ! -f "$ENV_FILE" ] && { echo "❌ Falta $ENV_FILE en $(pwd)"; exit 1; }
    
    # Extraer URL del .env de forma robusta
    local line
    line=$(grep '^GIT_REMOTE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | sed 's/^GIT_REMOTE_URL=//' | xargs)
    
    [ -z "$line" ] && { echo "❌ GIT_REMOTE_URL no definida en $ENV_FILE"; exit 1; }
    
    GIT_REMOTE_URL="$line"
    echo "✅ Remoto configurado: $GIT_REMOTE_URL"
}

# --- VALIDACIONES INICIALES ---
[ -z "${1:-}" ] && { echo "❌ Uso: gp \"mensaje del commit\""; exit 1; }
COMMIT_MSG="$1"

! git rev-parse --git-dir > /dev/null 2>&1 && { echo "❌ No es un repositorio Git"; exit 1; }

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
git add .

if ! git diff-index --quiet HEAD --; then
    echo "📝 Creando commit: $COMMIT_MSG"
    git commit -m "$COMMIT_MSG"
else
    echo "⚠️  Sin cambios nuevos para commit."
fi

echo "🚀 Ejecutando FORCE PUSH a $TARGET_REMOTE/$TARGET_BRANCH..."
# Forzamos el push a la rama main del origin
git push "$TARGET_REMOTE" "HEAD:$TARGET_BRANCH" --force-with-lease || {
    echo "⚠️  Push con lease falló, intentando force total..."
    git push "$TARGET_REMOTE" "HEAD:$TARGET_BRANCH" --force
}

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
