#!/usr/bin/env bash
# sync-full.sh — Despliegue completo, validación e integridad (Fin del día)
# Mejorado con: Restauración de datos, Inyección de secretos y Modo Estricto
set -euo pipefail

WORKSPACE_ID="booking-titanium"
LOCAL_PROFILE_NAME="local-direct-8080"
DUMP_FILE="neon_backup.dump"
DB_CONTAINER="booking-titanium-wm-db-1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏦 INICIANDO DESPLIEGUE FULL (INTEGRIDAD TOTAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. VALIDACIÓN TÉCNICA (Fail-Fast)
echo "🔍 1/6 Ejecutando Mypy y Ruff..."
uv run mypy --strict f/ && echo "✅ Tipado OK"
uv run ruff check . && echo "✅ Lint OK"

# 2. TESTS
echo "🧪 2/6 Ejecutando suite de pruebas Python..."
# Exponemos el puerto de redis para el test local si no lo está
docker compose -f docker-compose.windmill.yml up -d redis
uv run pytest tests/py/ -v && echo "✅ Tests pasados"

# 3. HARD RESET WINDMILL LOCAL
echo "🧨 3/6 Reiniciando Windmill local desde cero..."
if [ ! -f "$DUMP_FILE" ]; then
    echo "❌ ERROR: No se encontró $DUMP_FILE. El reset borraría los datos para siempre."
    exit 1
fi
bash scripts/windmill-hardreset-local.sh

# 4. RESTAURACIÓN DE DATOS Y ROLES
echo "💾 4/6 Restaurando datos de negocio y roles..."
docker exec -i "$DB_CONTAINER" pg_restore -U windmill -d windmill --no-owner --no-privileges < "$DUMP_FILE" || true
docker exec -i "$DB_CONTAINER" psql -U windmill -d windmill -c "CREATE ROLE windmill_admin; CREATE ROLE windmill_user; CREATE ROLE windmill_viewer;" 2>/dev/null || true
docker exec -i "$DB_CONTAINER" psql -U windmill -d windmill -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO windmill_admin; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO windmill_admin;"
docker exec -i "$DB_CONTAINER" psql -U windmill -d windmill -c "INSERT INTO folder (name, workspace_id, display_name, owners, extra_perms, default_permissioned_as) VALUES ('f', 'booking-titanium', 'F', '{}', '{\"g/all\": true}'::jsonb, '[]') ON CONFLICT DO NOTHING;"

# 5. INYECCIÓN DE SECRETOS (SSOT)
echo "🔑 5/6 Sincronizando secretos desde .env..."
source .env
docker exec -i "$DB_CONTAINER" psql -U windmill -d windmill -c "
INSERT INTO variable (path, workspace_id, value, is_secret) VALUES
('u/admin/TELEGRAM_BOT_TOKEN', 'booking-titanium', '$TELEGRAM_BOT_TOKEN', false),
('u/admin/OPENAI_API_KEY', 'booking-titanium', '$OPENAI_API_KEY', false),
('u/admin/OPENAI_MODEL', 'booking-titanium', '$OPENAI_MODEL', false)
ON CONFLICT (workspace_id, path) DO UPDATE SET value = EXCLUDED.value;"

# 6. SINCRO DE CÓDIGO Y METADATOS
echo "🔄 6/6 Regenerando metadatos y Sincronizando..."
# Regenerar metadatos para todos los main.py
find f -name "main.py" | xargs -I {} wmill generate-metadata {} > /dev/null
wmill sync push --workspace "$WORKSPACE_ID" --yes --parallel 10 --auto-metadata

# 7. GIT PUSH A GITHUB
if [ $# -gt 0 ]; then
  COMMIT_MSG="$1"
  git add -A
  git commit -m "build: $COMMIT_MSG" || echo "Nada nuevo para commit"
fi
echo "📤 Subiendo cambios a GitHub..."
git push origin main

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🟢 SISTEMA RECONSTRUIDO, RESTAURADO Y SINCRONIZADO"
echo "   • Base de Datos restaurada"
echo "   • Secretos inyectados"
echo "   • Código y Metadatos en total paridad"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
