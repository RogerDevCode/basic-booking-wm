# 🚀 gp.sh - Git Push Script

**Ubicación:** `./gp.sh`  
**Propósito:** Automatizar commit & push con seguridad

---

## 🎯 CARACTERÍSTICAS

### ✅ Security Checks
- **Secrets Detection:** Escanea API keys en docs y código
- **.env Cleanup:** Elimina archivos .env no trackeados
- **Gitignore Respect:** No limpia lo que ya está en .gitignore (ej: `resources/*.json`)

### ✅ Compilation Verification
- **Go:** `go mod tidy` + `go build ./...`
- **Node/Bun:** `bun install` o `npm install` (si existe package.json)

### ✅ Smart Push
- **Solo si hay cambios:** Detecta si hay cambios reales
- **Force con seguridad:** Usa `--force-with-lease` (más seguro que force)
- **Rama main:** Solo permite push desde main

---

## 📖 USO

### Con mensaje directo
```bash
./gp.sh "feat: add greeting cache"
```

### Con input interactivo
```bash
./gp.sh
# Enter commit message: fix: bug in intent detection
```

### Con remote personalizado
```bash
GIT_REMOTE_URL="git@github.com:user/repo.git" ./gp.sh "commit msg"
```

---

## 🔧 CONFIGURACIÓN

### Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `GIT_REMOTE_URL` | `git@github.com:RogerDevCode/basic-booking-wm.git` | Remote URL |

### .gitignore

El script respeta `.gitignore`. Archivos ignorados automáticamente:
```
resources/*.json
.env*
.secrets/
.secrets_wm/
```

---

## 🛡️ SECURITY CHECKS

El script **BLOQUEA** el commit si detecta:

### API Keys
```
❌ API keys detected in docs!
   Please redact secrets before committing
```

### Hardcoded Credentials
```
❌ Hardcoded credentials detected!
   Use environment variables instead
```

### Patrones Detectados
- `gsk_[a-zA-Z0-9]+` (Groq API keys)
- `sk-proj-[a-zA-Z0-9_-]+` (OpenAI API keys)
- `GOCSPX-[a-zA-Z0-9]+` (Google OAuth)
- `AIzaSy[a-zA-Z0-9_-]+` (Google API)
- `password/secret/api_key` hardcoded en código

---

## 📊 OUTPUT EJEMPLO

```
═══════════════════════════════════════════════════════════
  GIT PUSH - booking-titanium-wm
═══════════════════════════════════════════════════════════

✅ Branch: main
✅ Changes detected

🔒 STEP 1: Cleaning secrets...
  ✅ .env files removed
  🔍 Scanning for secrets...
  ✅ No secrets detected

🔨 STEP 2: Verifying compilation...
  📦 Go modules...
  ✅ go.mod OK
  🔨 Building Go...
  ✅ Go compilation OK

📝 STEP 3: Git add & commit...
  Committing: feat: add greeting cache
  ✅ Commit OK

🔗 STEP 4: Configuring remote...
  ✅ Remote already configured
  Remote: git@github.com:RogerDevCode/basic-booking-wm.git

🚀 STEP 5: Pushing to origin...
  Fetching...
  Pushing to main...
  ✅ Push successful!

═══════════════════════════════════════════════════════════
✅ PUSH COMPLETE!
═══════════════════════════════════════════════════════════
  Branch: main
  Remote: git@github.com:RogerDevCode/basic-booking-wm.git
  Message: feat: add greeting cache
  Files changed: 15
```

---

## ⚠️ ERRORES COMUNES

### "Not a Git repository"
```bash
❌ Not a Git repository
```
**Solución:** Ejecuta desde la raíz del repo

### "Must be on main branch"
```bash
❌ Must be on main branch (current: feature-xyz)
```
**Solución:** `git checkout main`

### "No changes to commit"
```bash
⚠️  No changes to commit
```
**Solución:** El script detecta que no hay cambios (exit code 0)

### "API keys detected in docs"
```bash
❌ API keys detected in docs!
   Please redact secrets before committing
```
**Solución:** Redacta las API keys en los docs (usa `***REDACTED***`)

---

## 🔍 COMPARACIÓN

### vs Git Commands Manuales

| Tarea | Manual | gp.sh |
|-------|--------|-------|
| **Limpiar secrets** | ❌ No | ✅ Automático |
| **Verificar compilación** | ❌ No | ✅ Automático |
| **Detectar cambios** | ✅ `git status` | ✅ Automático |
| **Force push seguro** | ✅ `--force-with-lease` | ✅ Automático |
| **Scan API keys** | ❌ No | ✅ Automático |

### vs Git Hooks
| Característica | Git Hooks | gp.sh |
|----------------|-----------|-------|
| **Pre-commit** | ✅ | ✅ |
| **Pre-push** | ✅ | ✅ |
| **Portable** | ❌ (local) | ✅ (versionado) |
| **Configurable** | ❌ | ✅ (env vars) |

---

## 🎯 BEST PRACTICES

### 1. Commit Messages
```bash
# ✅ Good
./gp.sh "feat: add greeting cache"
./gp.sh "fix: bug in intent detection"
./gp.sh "docs: update README"

# ❌ Bad
./gp.sh "fix"
./gp.sh "update"
./gp.sh "asdf"
```

### 2. Before Push
```bash
# Run tests first
go test ./...
./gp.sh "feat: new feature"
```

### 3. Secrets Management
```bash
# ✅ Good: Environment variables
export GROQ_API_KEY="gsk_..."

# ❌ Bad: Hardcoded
# GROQ_API_KEY="gsk_..." en código
```

---

## 📝 CHANGELOG

### v1.0.0 (2026-03-30)
- ✅ Secrets detection & cleanup
- ✅ Compilation verification (Go + Node)
- ✅ Smart push (only if changes)
- ✅ Force-with-lease (safe force)
- ✅ Branch protection (main only)
- ✅ Remote configuration
- ✅ Colored output
- ✅ Error handling

---

**Author:** Windmill Medical Booking Architect  
**Last Updated:** 2026-03-30  
**Status:** ✅ **PRODUCTION READY**
