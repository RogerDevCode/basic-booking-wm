# 🚀 DEPLOYMENT - COMANDOS EXACTOS PARA EJECUTAR

**Date:** 2026-03-28  
**Status:** ⏳ **READY FOR MANUAL EXECUTION**

---

## ⚠️ IMPORTANTE

Los siguientes pasos **DEBEN ejecutarse manualmente** porque:
1. Requieren conexión a base de datos (no disponible actualmente)
2. Requieren autenticación con Windmill (wmill CLI)
3. Requieren verificación humana entre cada paso

---

## 📋 PASOS PARA COMPLETAR EL DEPLOYMENT

### Paso 1: Migrar Base de Datos ⏳ **PENDING**

**Comando:**
```bash
bash scripts/step1_migrate_db.sh
```

**O ejecuta manualmente:**
```bash
# Conectar a Neon
psql "$NEON_DATABASE_URL" -f database/migrations/003_single_provider_migration.sql

# Ejecutar cleanup
psql "$NEON_DATABASE_URL" -f database/migrations/004_phase9_cleanup.sql

# Verificar
psql "$NEON_DATABASE_URL" -c "SELECT config_key, config_value FROM system_config ORDER BY config_key;"
```

**Expected:** 8+ configuración entries  
**Duration:** 2-5 minutes

---

### Paso 2: Push Resources a Windmill ⏳ **PENDING**

**Comando:**
```bash
bash scripts/step2_push_resources.sh
```

**O ejecuta manualmente:**
```bash
cd resources
wmill resource push --file postgres_neon.json
wmill resource push --file telegram.json
wmill resource push --file gmail.json
wmill resource push --file gcal.json
wmill resource push --file groq.json
wmill resource push --file openai.json
wmill resource push --file n8n_api.json
wmill resource push --file redis.json

# Verificar
wmill resource list
```

**Expected:** 8 resources created  
**Duration:** 5 minutes

---

### Paso 3: Deploy Scripts a Windmill ⏳ **PENDING**

**Comando:**
```bash
bash scripts/step3_deploy_scripts.sh
```

**O ejecuta manualmente:**
```bash
wmill sync push

# Verificar
wmill script list | grep -E "booking_|availability|distributed|circuit"
```

**Expected:** 17+ scripts deployed  
**Duration:** 10-15 minutes

---

### Paso 4: Build & Start API ⏳ **PENDING**

**Comando:**
```bash
bash scripts/step4_start_api.sh
```

**O ejecuta manualmente:**
```bash
# Build
go build -o bin/api ./cmd/api

# Start
./bin/api &

# Health check
curl http://localhost:8080/health
```

**Expected:** API running on port 8080  
**Duration:** 2-3 minutes

---

## ✅ CHECKLIST DE VERIFICACIÓN

Después de ejecutar cada paso, verifica:

### After Step 1 (Database):
- [ ] system_config table exists
- [ ] 8+ config entries
- [ ] 1 active provider
- [ ] 1 active service

### After Step 2 (Resources):
- [ ] postgres_neon resource exists
- [ ] telegram_bot resource exists
- [ ] gmail_smtp resource exists
- [ ] gcal resource exists
- [ ] groq resource exists
- [ ] openai resource exists

### After Step 3 (Scripts):
- [ ] booking_create deployed
- [ ] booking_cancel deployed
- [ ] availability_check deployed
- [ ] All 17+ scripts deployed

### After Step 4 (API):
- [ ] API process running
- [ ] Health endpoint responds
- [ ] No errors in logs

---

## 🎯 QUICK START (All Commands)

Si tienes todo listo (DB + Windmill auth), ejecuta:

```bash
# 1. Migrate DB
bash scripts/step1_migrate_db.sh

# 2. Push Resources
bash scripts/step2_push_resources.sh

# 3. Deploy Scripts
bash scripts/step3_deploy_scripts.sh

# 4. Start API
bash scripts/step4_start_api.sh

# 5. Verify
curl http://localhost:8080/health
```

---

## 📊 ESTADO ACTUAL

| Tarea | Status | Script |
|-------|--------|--------|
| **Tests** | ✅ COMPLETE | `pkg/utils/utils_test.go` |
| **Benchmarks** | ✅ COMPLETE | >4M ops/sec |
| **Build** | ✅ COMPLETE | `go build` passes |
| **Resources** | ⏳ PENDING | `step2_push_resources.sh` |
| **Scripts** | ⏳ PENDING | `step3_deploy_scripts.sh` |
| **DB Migration** | ⏳ PENDING | `step1_migrate_db.sh` |
| **API Start** | ⏳ PENDING | `step4_start_api.sh` |

---

## 🔄 ROLLBACK (Si algo sale mal)

### Rollback Database:
```bash
pg_restore -U booking -h localhost -d bookings \
  ~/backups/booking-titanium/backup_*.sql
```

### Rollback Windmill:
```bash
# Delete resources
wmill resource delete <resource_name>

# Revert scripts
git checkout HEAD~1
wmill sync push
```

### Stop API:
```bash
pkill -f "booking-titanium"
```

---

## 📞 SOPORTE

Si encuentras errores:

1. **Database errors:**
   - Verifica NEON_DATABASE_URL en .env
   - Check: `psql "$NEON_DATABASE_URL" -c "SELECT 1"`

2. **Windmill errors:**
   - Verifica autenticación: `wmill whoami`
   - Re-login: `wmill login`

3. **Build errors:**
   - Clean: `go clean`
   - Mod tidy: `go mod tidy`
   - Rebuild: `go build -o bin/api ./cmd/api`

---

## 🎉 POST-DEPLOYMENT

Cuando todo esté completo:

```bash
echo "═══════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE - SINGLE PROVIDER v5.0"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Version: 5.0.0"
echo "Date: $(date)"
echo "Status: PRODUCTION READY"
```

---

**Ready to execute:** ✅ YES  
**Scripts ready:** ✅ YES (4 scripts created)  
**Waiting for:** Manual execution with DB + Windmill access
