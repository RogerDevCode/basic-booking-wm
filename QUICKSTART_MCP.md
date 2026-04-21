# MCP + WINDMILL — QUICK START (15-MINUTE SETUP)

**Status:** Research complete. Red teams agree: **NO external MCP package needed.**

---

## ⚡ WHAT YOU NEED TO DO NOW (3 Steps)

### STEP 1 — Get Workspace ID (2 min)
1. Open browser: **http://localhost:8080**
2. Login to Windmill (if first time, use admin credentials)
3. Click **Settings** (gear icon, left sidebar)
4. Go to **Workspace** → **General** tab
5. Copy **Workspace ID** (UUID like `abc123de-...`)

### STEP 2 — Generate MCP Token (2 min)
1. Still in Settings, click **Tokens** in left menu
2. Toggle **"Generate MCP URL"** to **ON**
3. Choose **Scope: All** (or Favorites)
4. Click **"Generate MCP URL"**
5. Copy the **full URL** shown (starts with `http://localhost...`)

### STEP 3 — Run Setup Wizard (1 min)
```bash
cd /home/manager/Sync/wildmill-proyects/booking-titanium-wm
chmod +x scripts/setup-mcp-wizard.sh
bash scripts/setup-mcp-wizard.sh
```
- Wizard will ask for Workspace ID (paste from STEP 1)
- Wizard will ask for MCP URL (paste from STEP 2)
- It updates Zed config automatically
- Restart Zed when done

---

## ✅ VERIFY IT WORKS

```bash
# Run health check
bash scripts/verify-mcp.sh

# Full handshake test
bash scripts/test-mcp-handshake.sh
```

Then in Zed:
- Look for **MCP tools** panel (left sidebar, plug icon)
- Type in chat: *"List all my Windmill scripts"*
- Should return JSON with script list

---

## 📚 FULL DOCUMENTATION

- **Setup guide:** `docs/MCP_INTEGRATION.md` (complete reference)
- **Red team report:** `docs/MCP_REDTEAM_REPORT.md` (technical deep-dive)
- **Scripts:** `scripts/setup-*`, `scripts/verify-*`, `scripts/test-*`

---

## ❌ WHAT YOU DON'T NEED (Debunked)

- [x] `npm install -g @windmill-labs/mcp-windmill` (doesn't exist)
- [x] Extra Docker container for MCP bridge (built into server)
- [x] OAuth configuration for local dev (token-based simpler)
- [x] Port exposure changes (use existing Caddy on 8080)

---

**Time estimate:** 5 minutes once you have the two values (Workspace ID + MCP URL).

Start step 1 now.
