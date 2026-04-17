# 🚀 Booking Titanium — Local Development Setup

Complete guide for running the Medical Appointment Booking system locally on your machine.

---

## ⚡ Quick Start (2 minutes)

### 1. Prerequisites
```bash
# Verify you have these installed
docker --version           # Docker 20.10+
docker-compose --version   # Docker Compose 2.0+
node --version             # Node.js 18+
npm --version              # npm 9+
```

### 2. Clone & Setup
```bash
# Clone the repository
git clone https://github.com/your-org/booking-titanium-wm.git
cd booking-titanium-wm

# Run the automatic setup script
./scripts/setup-local.sh
```

### 3. Verify Everything Works
```bash
./scripts/validate-setup.sh
```

---

## 📦 What Gets Set Up

### Docker Services (via docker-compose.dev/)
- **PostgreSQL 17** — Main database (port 5432)
- **Redis** — Caching + distributed locks (port 6380)
- **Cloudflared Tunnel** — Public URL for Telegram webhooks (optional)

### Node.js Setup
- TypeScript compilation
- npm dependencies installed
- Test suite ready to run

---

## 🛠️ Manual Setup (If Script Fails)

### Step 1: Configure Docker Environment
```bash
cd docker-compose.dev

# Create .env from template
cp .env.example .env

# Edit .env with your settings (defaults are fine for local dev)
# Key settings:
#   POSTGRES_USER=booking_user
#   POSTGRES_PASSWORD=titanium_local_dev_2026
#   POSTGRES_DB=booking_titanium
#   POSTGRES_PORT=5432
#   REDIS_PORT=6380
```

### Step 2: Start Docker Services
```bash
# From docker-compose.dev/
docker-compose up -d --build

# Verify services are running
docker-compose ps

# Should show:
# - booking-dev-db (PostgreSQL) — Status: Up (healthy)
# - booking-dev-redis (Redis) — Status: Up (healthy)
```

### Step 3: Create Local Database Connection
```bash
# Return to project root
cd ..

# Create .env file
cp .env.example .env

# Update DATABASE_URL (CRITICAL FOR LOCAL DEV)
cat >> .env << 'EOF'

# Local Development Database
DATABASE_URL=postgresql://booking_user:titanium_local_dev_2026@127.0.0.1:5432/booking_titanium
REDIS_URL=redis://127.0.0.1:6380
EOF
```

### Step 4: Install Dependencies
```bash
npm install
```

### Step 5: Validate Setup
```bash
# TypeScript strict check
npm run typecheck

# ESLint validation
npx eslint 'f/**/*.ts'

# Run test suite
npm test
```

---

## 📊 Docker Services Details

### PostgreSQL

**Connection String (Local):**
```
postgresql://booking_user:titanium_local_dev_2026@127.0.0.1:5432/booking_titanium
```

**Access via CLI:**
```bash
# From docker-compose.dev/
docker-compose exec postgres psql -U booking_user -d booking_titanium

# List tables
\dt

# Exit
\q
```

**Schema:**
- Tables: providers, services, provider_schedules, clients, bookings
- Initialized from: `docker-compose.dev/database/init/001_init.sql`
- RLS enabled for multi-tenant isolation

### Redis

**Connection:**
```bash
# From docker-compose.dev/
docker-compose exec redis redis-cli

# Test connection
PING  # Should return PONG
```

**Usage:**
- Session caching
- Distributed locks for concurrency control
- Cache layer for availability checks

### Cloudflared (Optional)

⚠️ **Note:** Cloudflared requires a tunnel token to work. It will keep restarting, which is fine for local development. It's only needed if you want to expose your local dev environment to the internet for Telegram webhooks.

---

## 🧪 Common Development Tasks

### Run All Tests
```bash
npm test
```

### Run Tests for One Feature
```bash
npm test -- f/booking_create
npm test -- f/reminder_cron
npm test -- f/web_booking_api
```

### Watch Mode (Auto-run tests on file change)
```bash
npm run test:watch
```

### Type Checking Only (No Tests)
```bash
npm run typecheck
# or
tsc --noEmit
```

### ESLint (Find code style issues)
```bash
npx eslint 'f/**/*.ts'

# Fix automatically where possible
npx eslint 'f/**/*.ts' --fix
```

### View Database
```bash
cd docker-compose.dev
docker-compose exec postgres psql -U booking_user -d booking_titanium

# Example queries:
SELECT count(*) FROM bookings;
SELECT * FROM providers LIMIT 5;
SELECT * FROM clients LIMIT 5;
```

### View Redis
```bash
cd docker-compose.dev
docker-compose exec redis redis-cli

# Check keys
KEYS *

# Get value
GET {key_name}
```

### Stop All Docker Services
```bash
cd docker-compose.dev
docker-compose down

# Stop and remove volumes (WARNING: deletes data!)
docker-compose down -v
```

### Restart Services
```bash
cd docker-compose.dev
docker-compose restart
```

---

## 🐛 Troubleshooting

### "Port 5432 is already in use"
```bash
# Find what's using the port
lsof -i :5432

# Stop the conflicting service
kill -9 {PID}

# Then try docker-compose up again
```

### "Port 6380 is already in use"
```bash
# Same as above but for port 6380
lsof -i :6380
kill -9 {PID}
```

### "PostgreSQL won't connect"
```bash
# Check if container is actually running
docker-compose -f docker-compose.dev/docker-compose.yml ps postgres

# Check logs
docker-compose -f docker-compose.dev/docker-compose.yml logs postgres

# Restart container
docker-compose -f docker-compose.dev/docker-compose.yml restart postgres
```

### "npm install fails"
```bash
# Clear npm cache
npm cache clean --force

# Try again
npm install
```

### "TypeScript compilation errors"
```bash
# Check for real errors
npx tsc --noEmit

# If you see type errors, fix them per AGENTS.md §LAW
# No `any`, no `as Type` casts, use Zod validation instead
```

### Tests are failing
```bash
# Run with verbose output
npm test -- --reporter=verbose

# Run specific test file
npm test -- f/booking_create/main.test.ts

# Check database is up
docker-compose -f docker-compose.dev/docker-compose.yml ps postgres
```

---

## 📚 Environment Variables

### Required for Tests
```bash
DATABASE_URL=postgresql://booking_user:...@127.0.0.1:5432/booking_titanium
REDIS_URL=redis://127.0.0.1:6380
```

### Optional for Local Development
```bash
# If you want to test Telegram/Gmail/GCal features locally
TELEGRAM_BOT_TOKEN=your_bot_token
GMAIL_USER=your_email@gmail.com
GMAIL_PASSWORD=your_app_password
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
```

See `.env.example` for full list of optional variables.

---

## 📖 Architecture Overview

### Data Flow
```
Telegram User Message
  ↓
telegram_callback (webhook handler)
  ↓
booking_orchestrator (NLU intent detection)
  ↓
booking_create|cancel|reschedule|... (atomic DB transaction)
  ↓
PostgreSQL (source of truth)
  ↓
gcal_sync (async Google Calendar sync)
  ↓
telegram_send (confirmation message)
```

### §MON Split-Monolith Pattern
Each feature follows:
```
f/{feature}/
├── main.ts       (60-100 lines, orchestrator ONLY)
├── service.ts    (business logic)
├── repository.ts (data access)
├── utils.ts      (utilities)
└── types.ts      (types + Zod schemas)
```

See **CLAUDE.md** and **AGENTS.md** for detailed architecture.

---

## ✅ Verification Checklist

After setup, confirm:
- [ ] Docker services running: `docker-compose -f docker-compose.dev/docker-compose.yml ps`
- [ ] Can connect to PostgreSQL: `npm run typecheck` passes
- [ ] npm dependencies installed: `npm list --depth=0` shows packages
- [ ] Tests pass: `npm test` → 344 passed, 37 skipped
- [ ] TypeScript strict: `npm run typecheck` → zero errors
- [ ] ESLint clean: `npx eslint 'f/**/*.ts'` → zero errors
- [ ] Can edit files: try changing a comment in `f/booking_create/main.ts` and see tests run

---

## 🚀 Next Steps

1. **Read the codebase:**
   - Start with `CLAUDE.md` for quick overview
   - Then `AGENTS.md` for detailed rules
   - Then explore `f/booking_create/` as example feature

2. **Make a change:**
   - Edit a file in `f/` directory
   - Run `npm test` to validate
   - See tests pass or fail in real-time

3. **Create a PR:**
   - Follow git commits from `AGENTS.md §DEL`
   - Include `Co-Authored-By: Claude Haiku 4.5` tag
   - Tests must pass before merge

---

## 📞 Getting Help

- **Architecture questions:** See AGENTS.md §5
- **Split-Monolith pattern:** See CLAUDE.md § MON
- **Database schema:** See AGENTS.md §DB
- **Testing:** See CLAUDE.md "Running Tests"
- **Local setup issues:** This file (LOCAL_SETUP.md)

---

**Last Updated:** 2026-04-17  
**Status:** ✅ All services tested and working  
**Next:** `./scripts/validate-setup.sh` to confirm your setup
