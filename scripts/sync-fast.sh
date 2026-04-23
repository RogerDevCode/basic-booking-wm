#!/usr/bin/env bash
# sync-fast.sh — Sincronización quirúrgica y veloz para desarrollo
set -euo pipefail

WORKSPACE_ID="booking-titanium"

is_windmill_path() {
  local path="$1"
  [[ "$path" == f/* ]] || return 1
  [[ "$path" == *.ts || "$path" == *.script.yaml || "$path" == *.flow.yaml || "$path" == */flow.yaml || "$path" == *.lock || "$path" == *.script.lock || "$path" == *.folder.meta.yaml || "$path" == *.app.yaml ]]
}

append_unique() {
  local candidate="$1"
  [[ -n "$candidate" ]] || return 0
  for existing in "${TARGETS[@]:-}"; do
    [[ "$existing" == "$candidate" ]] && return 0
  done
  TARGETS+=("$candidate")
}

collect_targets() {
  TARGETS=()
  local path=""

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    is_windmill_path "$path" || continue
    [[ -e "$path" ]] || continue
    append_unique "$path"

    if [[ "$path" == *.ts ]]; then
      local script_yaml="${path%.ts}.script.yaml"
      [[ -f "$script_yaml" ]] && append_unique "$script_yaml"
    fi
  done < <(
    {
      git diff --name-only --diff-filter=ACMR
      git diff --name-only --cached --diff-filter=ACMR
      git ls-files --others --exclude-standard
    } | awk 'NF' | sort -u
  )
}

echo "⚡ Iniciando sincronización RÁPIDA..."

# 1. COMMIT LOCAL (Opcional)
if [ $# -gt 0 ]; then
  COMMIT_MSG="$1"
  git add -A
  git commit -m "fast: $COMMIT_MSG"
  echo "📝 Commit local realizado."
fi

collect_targets

if [ "${#TARGETS[@]}" -eq 0 ]; then
  echo "ℹ️ No hay cambios Windmill pendientes. Nada que sincronizar."
  exit 0
fi

INCLUDES=$(printf '%s\n' "${TARGETS[@]}" | awk 'NF' | sort -u | paste -sd, -)

echo "🎯 Targets:"
printf '  - %s\n' "${TARGETS[@]}"

echo "🩺 Verificando referencias lock rotas en targets..."
bash scripts/verify-broken-lock-refs.sh --fix --files "$INCLUDES"

# 2. PUSH INCREMENTAL A WINDMILL
echo "🔄 Regenerando metadatos selectivos..."
wmill generate-metadata --workspace "$WORKSPACE_ID" --yes --includes "$INCLUDES"

echo "🩺 Verificación final de locks en targets..."
bash scripts/verify-broken-lock-refs.sh --check --files "$INCLUDES" >/dev/null

echo "🔄 Subiendo cambios a Windmill (Modo paralelo)..."
wmill sync push --workspace "$WORKSPACE_ID" --parallel 10 --yes --includes "$INCLUDES"

echo "✅ Sincronizado en segundos."
