# Windmill Script Reload — Manual Steps

After each code fix, follow these steps to ensure Windmill uses the updated scripts:

## LOCAL (Docker - http://localhost:8080)

### Option 1: UI Refresh (Easiest)
1. Go to http://localhost:8080
2. Login with token: `0xqk7v4qpaP67WJ9XLGdv2jIJARJ2eYA`
3. Navigate to: **Scripts → f/internal/telegram_router → main**
4. Click **Reload** or **Save** button
5. Do the same for:
   - `f/internal/booking_fsm/**`
   - `f/internal/conversation_***`

### Option 2: CLI (if Windmill Git Sync is enabled)
```bash
# Inside Windmill container
docker exec -it booking-titanium-wm-windmill_server-1 \
  /windmill-cli script reload --path f/internal/telegram_router/main
```

### Option 3: Force via Docker restart
```bash
bash scripts/windmill-down.sh
bash scripts/windmill-up.sh
```

## REMOTE (Cloud/Production)

1. Get your cloud Windmill URL (e.g., `https://myapp.windmill.dev`)
2. Settings → Git Sync → **Pull from Git** button
3. Verify scripts are updated in cloud UI

## Verify Changes

```bash
# Test locally
npm run typecheck
npm test

# Test in Telegram
/start → 1 → 1
# Should show doctor list (not loop back to specialties)
```

## Automated Check

```bash
bash scripts/windmill-reload.sh
```

This script attempts to:
1. Trigger local git sync via API
2. Trigger remote git sync (if configured)
3. Run TypeScript check
