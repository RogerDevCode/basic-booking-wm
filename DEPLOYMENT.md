# Deployment Guide — Auto-Sync to Windmill

## Quick Start

```bash
bash scripts/git-push-and-sync.sh
# or
deploy  # (if alias loaded)
```

Then follow the interactive prompts.

---

## What It Does

```
┌─────────────────────────────────────┐
│ 1. Stage changes (git add -A)       │
├─────────────────────────────────────┤
│ 2. Commit with your message         │
├─────────────────────────────────────┤
│ 3. Push to GitHub (main branch)     │
├─────────────────────────────────────┤
│ 4. Trigger Windmill git sync        │
│    - Local (http://localhost:8080)  │
│    - Remote (https://wm.stax.ink)   │
├─────────────────────────────────────┤
│ 5. Verify TypeScript                │
├─────────────────────────────────────┤
│ ✅ Ready to test                    │
└─────────────────────────────────────┘
```

---

## Setup (One-Time)

### 1. Windmill Git Sync Variables
Added to `.env.wm.local`:
```bash
WM_GIT_REPO=git@github.com:RogerDevCode/basic-booking-wm.git
WM_GIT_BRANCH=main
WM_GIT_SYNC_INTERVAL=60
```

### 2. Auto-Sync Polling (No webhook needed!)
Windmill checks Git every 60 seconds:
```bash
WM_GIT_SYNC_INTERVAL=60  # in .env.wm.local
```

**What happens**: 
- You: `git push origin main`
- Windmill: Automatically syncs within 60 seconds
- No webhook configuration needed ✓

---

## Typical Workflow

### Scenario: Fix Telegram wizard bug

```bash
# 1. Make your changes
vim f/internal/telegram_router/main.ts

# 2. Run tests
npm test

# 3. Deploy (commit + push + sync)
bash scripts/git-push-and-sync.sh
# Follow prompts:
#   Commit message: "fix: Telegram wizard state persistence"
#   [automatic: push + sync]

# 4. Test in Telegram
/start → select specialty → verify it works

# 5. Done! ✓
```

---

## Auto-Sync Details

Windmill polls Git automatically every 60 seconds:
- **Local:** `http://localhost:8080` checks Git repo
- **Remote:** `https://wm.stax.ink` checks Git repo

No manual sync commands needed. Just:
1. `git push origin main`
2. Wait ≤60 seconds
3. Windmill syncs automatically

---

## Troubleshooting

### "Push failed"
- Check: `git status`
- Verify: on `main` branch
- Fix: `git pull origin main` first

### "Windmill sync failed"
- Local not running? Start: `bash scripts/windmill-up.sh`
- Remote token invalid? Update: `WM_TOKEN` in `.env.wm.local`
- Check logs: `docker logs cloudflared_tunnel`

### "TypeScript errors after deploy"
- Run: `npm run typecheck`
- Fix errors in source
- Re-run deployment script

---

## Environment Variables

| Variable | Local | Remote |
|----------|-------|--------|
| `WM_BASE_URL` | http://localhost:8080 | https://wm.stax.ink |
| `WM_TOKEN` | 0xqk7v4qpaP67WJ9XLGdv2jIJARJ2eYA | (same token) |
| `WM_GIT_REPO` | git@github.com:RogerDevCode/basic-booking-wm.git | (same) |
| `WM_GIT_BRANCH` | main | main |

---

## Related Docs

- **CLAUDE.md** — Development commands
- **WINDMILL_RELOAD_STEPS.md** — Manual reload via UI
- **README.md** — Architecture overview
