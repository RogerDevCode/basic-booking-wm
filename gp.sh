#!/bin/bash
# Git push script for booking-titanium-wm
# Features: Clean secrets, verify compilation, push only if changes

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Config
GIT_REMOTE_URL="${GIT_REMOTE_URL:-git@github.com:RogerDevCode/basic-booking-wm.git}"
BRANCH="main"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  GIT PUSH - booking-titanium-wm${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Not a Git repository${NC}"
    exit 1
fi

# Check branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo -e "${RED}❌ Must be on $BRANCH branch (current: $CURRENT_BRANCH)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Branch: $BRANCH${NC}"

# Check for changes
if git diff-index --quiet HEAD -- 2>/dev/null; then
    echo -e "${YELLOW}⚠️  No changes to commit${NC}"
    exit 0
fi
echo -e "${GREEN}✅ Changes detected${NC}"

# STEP 1: CLEAN SECRETS
echo ""
echo -e "${YELLOW}🔒 STEP 1: Cleaning secrets...${NC}"

# Remove any .env files (might be untracked)
find . -maxdepth 1 -name ".env*" -type f -delete 2>/dev/null && echo "  ✅ .env files removed" || true

# Check for secrets in staged files
echo "  🔍 Scanning for secrets..."
SECRETS_FOUND=0

# Check for API keys in docs
if git diff --cached --name-only | grep -q "docs/.*\.md"; then
    if git diff --cached docs/ | grep -qE "(gsk_[a-zA-Z0-9]+|sk-proj-[a-zA-Z0-9_-]+|GOCSPX-[a-zA-Z0-9]+|AIzaSy[a-zA-Z0-9_-]+)"; then
        echo -e "${RED}  ❌ API keys detected in docs!${NC}"
        echo -e "${YELLOW}  Please redact secrets before committing${NC}"
        SECRETS_FOUND=1
    fi
fi

# Check for credentials in code
if git diff --cached --name-only | grep -qE "\.(go|ts|js)$"; then
    if git diff --cached | grep -qE "(password|secret|api_key)\s*[:=]\s*['\"][^'\"]+['\"]"; then
        echo -e "${RED}  ❌ Hardcoded credentials detected!${NC}"
        echo -e "${YELLOW}  Use environment variables instead${NC}"
        SECRETS_FOUND=1
    fi
fi

if [ $SECRETS_FOUND -eq 1 ]; then
    echo -e "${RED}❌ Secrets cleanup failed${NC}"
    exit 1
fi
echo -e "${GREEN}  ✅ No secrets detected${NC}"

# STEP 2: VERIFY COMPILATION
echo ""
echo -e "${YELLOW}🔨 STEP 2: Verifying compilation...${NC}"

# Check Go modules
if [ -f "go.mod" ]; then
    echo "  📦 Go modules..."
    if ! go mod tidy 2>/dev/null; then
        echo -e "${RED}  ❌ go mod tidy failed${NC}"
        exit 1
    fi
    echo "  ✅ go.mod OK"
    
    echo "  🔨 Building Go..."
    if ! go build ./... 2>&1 | tee /tmp/go_build.log; then
        echo -e "${RED}❌ Go compilation failed${NC}"
        echo -e "${YELLOW}Check /tmp/go_build.log for details${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✅ Go compilation OK${NC}"
fi

# Check TypeScript/Bun if exists
if [ -f "package.json" ]; then
    echo "  📦 Node modules..."
    if command -v bun > /dev/null 2>&1; then
        if ! bun install 2>/dev/null; then
            echo -e "${YELLOW}  ⚠️  bun install warning (non-fatal)${NC}"
        fi
    elif command -v npm > /dev/null 2>&1; then
        if ! npm install 2>/dev/null; then
            echo -e "${YELLOW}  ⚠️  npm install warning (non-fatal)${NC}"
        fi
    fi
fi

# STEP 3: GIT ADD & COMMIT
echo ""
echo -e "${YELLOW}📝 STEP 3: Git add & commit...${NC}"

# Get commit message
if [ -z "$1" ]; then
    echo -e "${YELLOW}Enter commit message (or 'q' to quit):${NC}"
    read -r COMMIT_MSG
    if [ "$COMMIT_MSG" = "q" ]; then
        echo -e "${YELLOW}Aborted${NC}"
        exit 0
    fi
else
    COMMIT_MSG="$1"
fi

if [ -z "$COMMIT_MSG" ]; then
    echo -e "${RED}❌ Commit message required${NC}"
    exit 1
fi

# Add all changes
git add . || { echo -e "${RED}❌ git add failed${NC}"; exit 1; }

# Check if there are staged changes
if git diff-index --quiet HEAD -- 2>/dev/null; then
    echo -e "${YELLOW}⚠️  No changes to commit after cleanup${NC}"
    exit 0
fi

# Commit
echo "  Committing: $COMMIT_MSG"
git commit -m "$COMMIT_MSG" || { echo -e "${RED}❌ Commit failed${NC}"; exit 1; }
echo -e "${GREEN}  ✅ Commit OK${NC}"

# STEP 4: CONFIGURE REMOTE
echo ""
echo -e "${YELLOW}🔗 STEP 4: Configuring remote...${NC}"

CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$CURRENT_REMOTE" != "$GIT_REMOTE_URL" ]; then
    if [ -n "$CURRENT_REMOTE" ]; then
        git remote set-url origin "$GIT_REMOTE_URL"
        echo "  🔄 Remote updated"
    else
        git remote add origin "$GIT_REMOTE_URL"
        echo "  ➕ Remote added"
    fi
else
    echo "  ✅ Remote already configured"
fi
echo "  Remote: $GIT_REMOTE_URL"

# STEP 5: PUSH
echo ""
echo -e "${YELLOW}🚀 STEP 5: Pushing to origin...${NC}"

# Fetch first
echo "  Fetching..."
git fetch origin 2>/dev/null || echo -e "${YELLOW}  ⚠️  Fetch warning (non-fatal)${NC}"

# Push with lease (safer than force)
echo "  Pushing to $BRANCH..."
if git push origin "$BRANCH" --force-with-lease; then
    echo -e "${GREEN}  ✅ Push successful!${NC}"
else
    echo -e "${RED}❌ Push failed${NC}"
    echo -e "${YELLOW}Try: git fetch origin && git reset --hard origin/$BRANCH${NC}"
    exit 1
fi

# SUMMARY
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ PUSH COMPLETE!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo "  Branch: $BRANCH"
echo "  Remote: $GIT_REMOTE_URL"
echo "  Message: $COMMIT_MSG"
echo ""

# Show stats
ADDED=$(git diff-tree --no-commit-id --name-only -r HEAD | wc -l | tr -d ' ')
echo "  Files changed: $ADDED"
echo ""
