# Docker Setup — Windmill Local Development

## Quick Start

```bash
# Start Windmill with local PostgreSQL (production-grade)
docker-compose -f docker-compose.windmill.yml --env-file .env.wm.local up -d

# Access Windmill UI
open http://localhost:8080
```

---

## Architecture

| File | Purpose | Use Case |
|------|---------|----------|
| `docker-compose.windmill.yml` | **Main** — Windmill server, workers, dind, caddy, local PostgreSQL | Always use this |
| `docker-compose.windmill.override.yml` | Override for Neon cloud DB (external) | When using Neon (prod), not local dev |
| `docker-compose.windmill.ports.yml` | Port mapping (Caddy on 8080) | Already in main compose |
| `docker-compose.windmirror.yml` | Image mirror (ghcr.dockerproxy.com) | If ghcr.io is slow |
| `docker-compose.cloudflared.yml` | **Optional** — Cloudflare Tunnel for external tests | Add when needed |

---

## Environment Files

| File | Purpose |
|------|---------|
| `.env.wm.local` | ✅ **USE THIS** — Local PostgreSQL + dev settings |
| `.env.wm` | Old Neon config, deprecated (do not use) |
| `.env.cloudflared` | Cloudflare Tunnel token (configure if needed) |

---

## Common Commands

### Local Development (default)

```bash
# Start everything
docker-compose -f docker-compose.windmill.yml --env-file .env.wm.local up -d

# View logs
docker-compose -f docker-compose.windmill.yml logs -f windmill_server

# Stop
docker-compose -f docker-compose.windmill.yml down
```

### With Cloudflare Tunnel (for external tests)

```bash
# 1. Get Cloudflare Tunnel token
#    - Go to: https://dash.cloudflare.com/
#    - Create tunnel named "booking-titanium"
#    - Get token and paste into .env.cloudflared

# 2. Start Windmill + Tunnel
docker-compose \
  -f docker-compose.windmill.yml \
  -f docker-compose.cloudflared.yml \
  --env-file .env.wm.local \
  up -d

# 3. Check tunnel status
docker logs windmill-cloudflared-tunnel
```

### Using Image Mirror (slow network)

```bash
docker-compose \
  -f docker-compose.windmill.yml \
  -f docker-compose.windmirror.yml \
  --env-file .env.wm.local \
  up -d
```

### Neon Cloud Database (external)

```bash
docker-compose \
  -f docker-compose.windmill.yml \
  -f docker-compose.windmill.override.yml \
  --env-file .env.wm \
  up -d
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose -f docker-compose.windmill.yml logs windmill_server

# Check health
docker-compose -f docker-compose.windmill.yml ps

# Restart
docker-compose -f docker-compose.windmill.yml restart
```

### Database not initializing

```bash
# Verify PostgreSQL is healthy
docker-compose -f docker-compose.windmill.yml logs db

# Reset database
docker-compose -f docker-compose.windmill.yml down
docker volume rm booking-titanium-wm_db_data  # WARNING: deletes data
docker-compose -f docker-compose.windmill.yml up -d
```

### Port conflicts

- Windmill UI: http://localhost:8080 (Caddy reverse proxy)
- PostgreSQL: localhost:5432 (internal only)
- Redis: localhost:6379 (if running separately)

---

## Services Running

| Service | Port | Health Check |
|---------|------|--------------|
| `windmill_server` | 8000 (internal) | 8080 → caddy → server |
| `windmill_worker` | internal | Executes TypeScript scripts |
| `windmill_worker_native` | internal | Go native execution (disabled) |
| `dind` | 2375 | Docker-in-Docker daemon |
| `caddy` | **8080** | Reverse proxy (public interface) |
| `db` | 5432 (internal) | PostgreSQL |

---

## Environment Variables (.env.wm.local)

```bash
# Local PostgreSQL
DATABASE_URL=postgresql://postgres:windmill_local_pw@db:5432/windmill

# Windmill config
WM_IMAGE=ghcr.io/windmill-labs/windmill:latest
WM_BASE_URL=http://localhost:8080
WM_TOKEN=0xqk7v4qpaP67WJ9XLGdv2jIJARJ2eYA

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ID=...

# Worker settings (production standards)
WORKER_TIMEOUT=1800
FAVOR_UNSHARE_PID=true
DISABLE_NSJAIL=true

# Logging
LOG_MAX_SIZE=20m
LOG_MAX_FILE=10
```

Change `POSTGRES_PASSWORD` and `ENCRYPTION_KEY` for production.

---

**Last Updated:** 2026-04-18  
**Windmill Version:** latest  
**PostgreSQL:** 16 (local)
