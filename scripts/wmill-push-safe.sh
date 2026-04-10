#!/usr/bin/env bash
# wmill-push-safe.sh — Validates TypeScript + AGENTS.md before pushing to Windmill
set -euo pipefail

echo "🔍 Step 1: TypeScript strict check..."
npx tsc --noEmit --project tsconfig.strict.json || { echo "❌ TSC failed. Fix errors before pushing."; exit 1; }

echo "🔍 Step 2: AGENTS.md lint..."
node scripts/agents-lint.mjs || { echo "❌ AGENTS.md violations found."; exit 1; }

echo "🚀 Step 3: Pushing to Windmill..."
wmill push "$@"

echo "✅ Deploy complete."
