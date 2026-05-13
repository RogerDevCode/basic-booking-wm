#!/usr/bin/env bash
# sync-fast.sh — Sincronización quirúrgica local → Windmill
#
# Uso:
#   bash scripts/sync-fast.sh                          # auto-detecta archivos cambiados
#   bash scripts/sync-fast.sh f/foo/main.py f/bar/main.py  # archivos explícitos
#
set -euo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' NC='\033[0m'

# ── Config ────────────────────────────────────────────────────────────────────
WORKSPACE="booking-titanium"
START_TS=$(date +%s)

# ── Notificación de escritorio ────────────────────────────────────────────────
notify() {
  local icon="$1" title="$2" body="$3"
  command -v notify-send &>/dev/null && notify-send --icon="$icon" "$title" "$body" 2>/dev/null || true
}

# ── Trap: notifica si el script falla antes de llegar al final ────────────────
_on_error() {
  local line=$1
  echo -e "\n${R}✗ sync-fast falló en línea $line${NC}"
  notify "dialog-error" "⚡ Sync FALLÓ" "Error en línea $line — revisa la terminal."
}
trap '_on_error $LINENO' ERR

# ── Resolución infalible de wmill ─────────────────────────────────────────────
_find_wmill() {
  # 1. PATH normal
  command -v wmill 2>/dev/null && return
  # 2. Symlink canónico
  [[ -x "$HOME/.local/bin/wmill" ]] && { echo "$HOME/.local/bin/wmill"; return; }
  # 3. Busca en nvm (cualquier versión de node instalada)
  local bin
  bin=$(find "$HOME/.nvm/versions/node" -maxdepth 3 -name "wmill" -type f 2>/dev/null | sort -V | tail -1)
  if [[ -n "$bin" ]]; then
    mkdir -p "$HOME/.local/bin"
    ln -sf "$bin" "$HOME/.local/bin/wmill"
    echo "$HOME/.local/bin/wmill"
    return
  fi
  echo -e "${R}✗ wmill no encontrado. Instala: npm i -g windmill-cli${NC}" >&2
  exit 1
}
WMILL=$(_find_wmill)

# ── Filtro de rutas válidas para Windmill ─────────────────────────────────────
_is_wm_path() {
  local p="$1"
  [[ "$p" == f/* ]] || return 1
  [[ "$p" == *.py || "$p" == *.yaml || "$p" == *.lock || "$p" == *.json ]] || return 1
  [[ -f "$p" ]] || return 1
}

# ── Recolectar targets ────────────────────────────────────────────────────────
declare -a TARGETS=()

_add() {
  local p="$1"
  [[ -z "$p" ]] && return
  for t in "${TARGETS[@]:-}"; do [[ "$t" == "$p" ]] && return; done
  TARGETS+=("$p")
}

if [[ $# -gt 0 ]]; then
  # Archivos explícitos pasados como argumentos
  for arg in "$@"; do
    _is_wm_path "$arg" && _add "$arg" || echo -e "${Y}⚠ Ignorado (no es ruta Windmill): $arg${NC}"
  done
else
  # Auto-detección: diff no commiteado + untracked
  while IFS= read -r p; do
    _is_wm_path "$p" || continue
    _add "$p"
    # Incluir .script.yaml/.script.lock asociados al .py
    if [[ "$p" == *.py ]]; then
      local_base="${p%.py}"
      [[ -f "${local_base}.script.yaml" ]] && _add "${local_base}.script.yaml"
      [[ -f "${local_base}.script.lock" ]] && _add "${local_base}.script.lock"
    fi
  done < <(
    { git diff --name-only --diff-filter=ACMR
      git diff --name-only --cached --diff-filter=ACMR
      git ls-files --others --exclude-standard
    } | sort -u
  )
fi

# ── Nada que hacer ────────────────────────────────────────────────────────────
if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo -e "${B}ℹ No hay cambios Windmill pendientes.${NC}"
  notify "dialog-information" "⚡ Sync" "Sin cambios pendientes."
  exit 0
fi

INCLUDES=$(printf '%s,' "${TARGETS[@]}" | sed 's/,$//')

echo -e "${B}⚡ sync-fast → workspace: ${WORKSPACE}${NC}"
echo -e "${B}🎯 Archivos (${#TARGETS[@]}):${NC}"
printf '   %s\n' "${TARGETS[@]}"
echo ""

# ── Reparar referencias lock rotas (inline, sin script externo) ───────────────
for yaml in "${TARGETS[@]}"; do
  [[ "$yaml" == *.script.yaml ]] || continue
  [[ -f "$yaml" ]] || continue
  # Elimina líneas con 'lock: !inline path' cuyo archivo no existe
  if grep -qE "lock: '!inline " "$yaml" 2>/dev/null; then
    while IFS= read -r line; do
      ref=$(echo "$line" | sed -n "s/.*lock: '!inline \([^']*\)'.*/\1/p")
      [[ -z "$ref" ]] && continue
      [[ -f "$ref" ]] && continue
      echo -e "${Y}  ⚠ Lock roto reparado: $ref en $yaml${NC}"
      sed -i "\|lock: '!inline ${ref}'|d" "$yaml"
    done < <(grep "lock: '!inline " "$yaml")
  fi
done

# ── Regenerar metadatos ───────────────────────────────────────────────────────
echo -e "${B}🔄 Regenerando metadatos...${NC}"
"$WMILL" generate-metadata --workspace "$WORKSPACE" --yes --includes "$INCLUDES" 2>&1 \
  | grep -v "^$\|metadata up-to-date\|Using workspace" || true

# ── Push ──────────────────────────────────────────────────────────────────────
echo -e "${B}🚀 Subiendo a Windmill...${NC}"
"$WMILL" sync push --workspace "$WORKSPACE" --parallel 10 --yes --includes "$INCLUDES"

# ── Resumen ───────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START_TS ))
echo ""
echo -e "${G}✅ Sincronizado en ${ELAPSED}s — ${#TARGETS[@]} archivo(s)${NC}"
notify "dialog-apply" "⚡ Sync OK (${ELAPSED}s)" "$(printf '%s\n' "${TARGETS[@]}" | head -5 | paste -sd ', ')"
