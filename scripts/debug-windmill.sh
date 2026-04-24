#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════
# Windmill Debug Helper — Quick diagnostics for flow execution errors
# ════════════════════════════════════════════════════════════════════════════════
# Usage:
#   bash scripts/debug-windmill.sh                    # Show latest job status
#   bash scripts/debug-windmill.sh logs               # Show logs of latest failure
#   bash scripts/debug-windmill.sh result             # Show error details
#   bash scripts/debug-windmill.sh watch              # Monitor jobs in real-time
# ════════════════════════════════════════════════════════════════════════════════

set -euo pipefail

WORKSPACE="booking-titanium"
SCRIPT_PATH="f/flows/telegram_webhook__flow"
LIMIT=5

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function: List recent jobs
list_jobs() {
  echo -e "${BLUE}Recent executions of $SCRIPT_PATH:${NC}"
  wmill job list --workspace "$WORKSPACE" --script-path "$SCRIPT_PATH" --limit "$LIMIT" 2>&1
  echo ""
}

# Function: Show logs of latest failure
show_logs() {
  echo -e "${BLUE}Fetching logs of latest failure...${NC}"
  FAILED_JOB=$(wmill job list --workspace "$WORKSPACE" --script-path "$SCRIPT_PATH" --failed --limit 1 --json 2>&1 | jq -r '.[0].id // empty' || echo "")

  if [ -z "$FAILED_JOB" ]; then
    echo -e "${YELLOW}No failed jobs found.${NC}"
    return
  fi

  echo -e "${YELLOW}Job ID: $FAILED_JOB${NC}"
  echo ""
  wmill job logs "$FAILED_JOB" --workspace "$WORKSPACE" 2>&1 | tail -100
}

# Function: Show error result
show_result() {
  echo -e "${BLUE}Fetching error details...${NC}"
  FAILED_JOB=$(wmill job list --workspace "$WORKSPACE" --script-path "$SCRIPT_PATH" --failed --limit 1 --json 2>&1 | jq -r '.[0].id // empty' || echo "")

  if [ -z "$FAILED_JOB" ]; then
    echo -e "${YELLOW}No failed jobs found.${NC}"
    return
  fi

  echo -e "${RED}Error in job $FAILED_JOB:${NC}"
  wmill job result "$FAILED_JOB" --workspace "$WORKSPACE" --json 2>&1 | jq '.' | head -50
}

# Function: Watch jobs in real-time
watch_jobs() {
  echo -e "${BLUE}Watching jobs (press Ctrl+C to exit)...${NC}"
  echo ""
  while true; do
    clear
    echo -e "${BLUE}=== Windmill Job Monitor ===${NC}"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    list_jobs
    sleep 5
  done
}

# Function: Validate flow paths
validate_paths() {
  echo -e "${BLUE}Validating script paths in flow.yaml...${NC}"
  MISSING_MAIN=0

  while IFS= read -r line; do
    if [[ $line =~ path:\ f/ ]]; then
      if [[ ! $line =~ /main$ ]]; then
        echo -e "${RED}✗ Missing /main: $line${NC}"
        MISSING_MAIN=$((MISSING_MAIN + 1))
      else
        echo -e "${GREEN}✓ $line${NC}"
      fi
    fi
  done < <(grep 'path: f/' f/flows/telegram_webhook__flow/flow.yaml)

  echo ""
  if [ $MISSING_MAIN -eq 0 ]; then
    echo -e "${GREEN}✅ All paths have /main suffix${NC}"
  else
    echo -e "${RED}❌ $MISSING_MAIN paths missing /main suffix${NC}"
  fi
}

# Main
case "${1:-status}" in
  logs)
    show_logs
    ;;
  result)
    show_result
    ;;
  watch)
    watch_jobs
    ;;
  validate)
    validate_paths
    ;;
  status|*)
    list_jobs
    ;;
esac
