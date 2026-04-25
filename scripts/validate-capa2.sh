#!/bin/bash

##############################################################################
# Token Optimization Validation - Capa 2 (claude-mem)
# Verifies auto-memory configuration is correctly set up
##############################################################################

set -e

echo "🔍 Capa 2 Validation: Auto-Memory Optimization"
echo "=============================================="
echo ""

CLAUDE_MEM_CONFIG="$HOME/.claude-mem/settings.json"
TESTS_PASSED=0
TESTS_FAILED=0

##############################################################################
# Helper functions
##############################################################################

test_step() {
  local name="$1"
  echo -n "  $name ... "
}

test_pass() {
  echo "✓"
  ((TESTS_PASSED++))
}

test_fail() {
  local reason="$1"
  echo "✗ $reason"
  ((TESTS_FAILED++))
}

##############################################################################
# Tests
##############################################################################

echo "📋 Capa 2: Auto-Memory (claude-mem)"
echo ""

# Test 1: Configuration file exists
test_step "Configuration file exists"
if [ -f "$CLAUDE_MEM_CONFIG" ]; then
  test_pass
else
  test_fail "File not found: $CLAUDE_MEM_CONFIG"
fi

# Test 2: JSON is valid
test_step "JSON syntax valid"
if jq empty "$CLAUDE_MEM_CONFIG" 2>/dev/null; then
  test_pass
else
  test_fail "Invalid JSON in settings.json"
fi

# Test 3: Model is sonnet
test_step "Model set to 'sonnet'"
if jq -e '.model == "sonnet"' "$CLAUDE_MEM_CONFIG" &>/dev/null; then
  test_pass
else
  test_fail "Model should be 'sonnet' (not opus)"
fi

# Test 4: Progressive disclosure enabled
test_step "Progressive disclosure enabled"
if jq -e '.contextInjection.progressiveDisclosure == true' "$CLAUDE_MEM_CONFIG" &>/dev/null; then
  test_pass
else
  test_fail "progressiveDisclosure should be true"
fi

# Test 5: Vector threshold configured
test_step "Vector threshold set to 0.75"
if jq -e '.CLAUDE_MEM_VECTOR_THRESHOLD == 0.75' "$CLAUDE_MEM_CONFIG" &>/dev/null; then
  test_pass
else
  test_fail "CLAUDE_MEM_VECTOR_THRESHOLD should be 0.75"
fi

# Test 6: Skip tools configured
test_step "Skip tools configured"
if jq -e '.CLAUDE_MEM_SKIP_TOOLS' "$CLAUDE_MEM_CONFIG" &>/dev/null; then
  test_pass
else
  test_fail "CLAUDE_MEM_SKIP_TOOLS not configured"
fi

# Test 7: HNSW tuning present
test_step "HNSW search_ef tuned to 50"
if jq -e '.memory.hnsw.search_ef == 50' "$CLAUDE_MEM_CONFIG" &>/dev/null; then
  test_pass
else
  test_fail "HNSW search_ef should be 50 (balance speed/accuracy)"
fi

# Test 8: Retention cleanup enabled
test_step "Auto-cleanup enabled (90 days)"
if jq -e '.memory.autoCleanup == true and .memory.retentionDays == 90' "$CLAUDE_MEM_CONFIG" &>/dev/null; then
  test_pass
else
  test_fail "Auto-cleanup or retention days misconfigured"
fi

# Test 9: Database exists and has data
test_step "Claude-mem database initialized"
if [ -f "$HOME/.claude-mem/claude-mem.db" ]; then
  SIZE=$(du -h "$HOME/.claude-mem/claude-mem.db" | cut -f1)
  echo "✓ ($SIZE)"
  ((TESTS_PASSED++))
else
  test_fail "Database not found (will be created on first use)"
fi

# Test 10: Chroma vector DB present
test_step "Chroma vector database configured"
if [ -d "$HOME/.claude-mem/chroma" ]; then
  test_pass
else
  test_fail "Chroma directory not found (will be created on first use)"
fi

##############################################################################
# Summary
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📊 Test Results"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Passed: $TESTS_PASSED/10"
echo "Failed: $TESTS_FAILED/10"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo "✅ Capa 2 Configuration: READY"
  echo ""
  echo "📈 Expected Impact:"
  echo "  • Session N (Current):   75% token reduction (Capa 1 + capture)"
  echo "  • Session N+1 (Next):    ~80% token reduction (Capa 1 + memory)"
  echo "  • Memory injection:      150-450 tokens (vs 5-10K manual)"
  echo ""
  echo "🚀 Next Steps:"
  echo "  1. Close Claude Code completely"
  echo "  2. Reopen the project"
  echo "  3. Use project normally (edit, run, decide)"
  echo "  4. Close when done"
  echo "  5. Reopen in new session"
  echo "  6. Run: /context (should show memory injection)"
  echo ""
  exit 0
else
  echo "⚠️ Capa 2 Configuration: INCOMPLETE"
  echo ""
  echo "Please fix the issues above and rerun this script."
  echo ""
  exit 1
fi
