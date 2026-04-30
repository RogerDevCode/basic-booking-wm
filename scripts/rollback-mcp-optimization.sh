#!/usr/bin/env bash
# rollback-mcp-optimization.sh — Revert MCP and extension installations

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "🧨 Iniciando rollback de optimizaciones..."

# 1. Remover servidores MCP
echo "🗑️  Removiendo servidores MCP..."
gemini mcp remove filesystem || true
gemini mcp remove github || true
gemini mcp remove gemini-docs || true
gemini mcp remove token-savior || true

# 2. Desinstalar extensiones
echo "🗑️  Desinstalando extensión Caveman..."
gemini extensions uninstall caveman || true

# 3. Restaurar GEMINI.md
echo "📝 Restaurando GEMINI.md..."
# Eliminar la sección de Caveman Mode (desde el separador hasta el final)
sed -i '/---/, $d' GEMINI.md
# Asegurar que termina con una sola línea nueva
sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' GEMINI.md

echo -e "${GREEN}✅ Rollback completado. El sistema ha vuelto al punto anterior.${NC}"
