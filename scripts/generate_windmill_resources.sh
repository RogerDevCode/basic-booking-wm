#!/bin/bash

# ============================================================================
# GENERATE WINDMILL RESOURCES FROM .ENV
# ============================================================================
# Este script lee el archivo .env y crea/actualiza los recursos de Windmill
# 
# Uso: bash scripts/generate_windmill_resources.sh
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  GENERATE WINDMILL RESOURCES FROM .ENV${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Check .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    echo "Please create .env file with your credentials"
    exit 1
fi

# Load .env variables
set -a
source .env
set +a

# Create resources directory
mkdir -p resources

# ============================================================================
# 1. POSTGRESQL RESOURCE (Neon)
# ============================================================================
echo "Creating PostgreSQL resource..."

cat > resources/postgres_neon.json << EOF
{
  "name": "postgres_neon",
  "type": "postgres",
  "description": "Neon PostgreSQL database for Booking Titanium",
  "config": {
    "url": "${NEON_DATABASE_URL:-postgresql://user:pass@host:5432/dbname}"
  }
}
EOF

echo -e "${GREEN}✓ PostgreSQL resource created${NC}"

# ============================================================================
# 2. TELEGRAM RESOURCE
# ============================================================================
echo "Creating Telegram resource..."

cat > resources/telegram.json << EOF
{
  "name": "telegram_bot",
  "type": "http",
  "description": "Telegram Bot API",
  "config": {
    "bot_token": "${TELEGRAM_TOKEN:-}",
    "api_url": "https://api.telegram.org",
    "default_chat_id": "${TELEGRAM_ID:-}"
  }
}
EOF

echo -e "${GREEN}✓ Telegram resource created${NC}"

# ============================================================================
# 3. GMAIL RESOURCE
# ============================================================================
echo "Creating Gmail resource..."

cat > resources/gmail.json << EOF
{
  "name": "gmail_smtp",
  "type": "smtp",
  "description": "Gmail SMTP for sending emails",
  "config": {
    "host": "smtp.gmail.com",
    "port": 587,
    "username": "${GMAIL_CLIENT_ID:-}",
    "password": "${GMAIL_CLIENT_SECRET:-}",
    "from_email": "${GMAIL_CLIENT_ID:-}",
    "from_name": "Booking Titanium"
  }
}
EOF

echo -e "${GREEN}✓ Gmail resource created${NC}"

# ============================================================================
# 4. GOOGLE CALENDAR RESOURCE
# ============================================================================
echo "Creating Google Calendar resource..."

cat > resources/gcal.json << EOF
{
  "name": "google_calendar",
  "type": "google",
  "description": "Google Calendar API",
  "config": {
    "client_id": "${GCAL_CLIENT_ID:-}",
    "client_secret": "${GCAL_CLIENT_SECRET:-}",
    "api_key": "${GCALENDAR_API_KEY:-}",
    "default_calendar": "primary"
  }
}
EOF

echo -e "${GREEN}✓ Google Calendar resource created${NC}"

# ============================================================================
# 5. GROQ LLM RESOURCE
# ============================================================================
echo "Creating Groq LLM resource..."

cat > resources/groq.json << EOF
{
  "name": "groq_llm",
  "type": "http",
  "description": "Groq API for LLM inference",
  "config": {
    "api_key": "${GROQ_API_KEY:-}",
    "base_url": "https://api.groq.com/openai/v1",
    "model": "llama-3.3-70b-versatile"
  }
}
EOF

echo -e "${GREEN}✓ Groq resource created${NC}"

# ============================================================================
# 6. OPENAI RESOURCE (Fallback)
# ============================================================================
echo "Creating OpenAI resource..."

cat > resources/openai.json << EOF
{
  "name": "openai_llm",
  "type": "http",
  "description": "OpenAI API (fallback LLM)",
  "config": {
    "api_key": "${OPENAI_API_KEY:-}",
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o-mini"
  }
}
EOF

echo -e "${GREEN}✓ OpenAI resource created${NC}"

# ============================================================================
# 7. N8N API RESOURCE
# ============================================================================
echo "Creating N8N API resource..."

cat > resources/n8n_api.json << EOF
{
  "name": "n8n_api",
  "type": "http",
  "description": "N8N API for workflow automation",
  "config": {
    "base_url": "${N8N_API_URL:-https://n8n.stax.ink}",
    "api_key": "${N8N_API_KEY:-}",
    "access_token": "${N8N_ACCESS_TOKEN:-}"
  }
}
EOF

echo -e "${GREEN}✓ N8N resource created${NC}"

# ============================================================================
# 8. REDIS RESOURCE
# ============================================================================
echo "Creating Redis resource..."

cat > resources/redis.json << EOF
{
  "name": "redis_cache",
  "type": "redis",
  "description": "Redis for caching and distributed locks",
  "config": {
    "host": "localhost",
    "port": 6379,
    "password": "${REDIS_PASSWORD:-}"
  }
}
EOF

echo -e "${GREEN}✓ Redis resource created${NC}"

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  RESOURCES CREATED${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

ls -la resources/

echo ""
echo -e "${GREEN}✓ All resources created successfully${NC}"
echo ""
echo "Next steps:"
echo "1. Review resources in resources/ directory"
echo "2. Push to Windmill: wmill resource push --file resources/*.json"
echo "3. Or manually import via Windmill UI"
echo ""
