# 🚀 DEPLOYMENT A PRODUCCIÓN - Booking Titanium AI Agent v2.3

**Fecha:** 2026-03-31  
**Estado:** ✅ **LISTO PARA DEPLOY**  
**Versión:** 2.3.0

---

## 📋 **PRE-DEPLOYMENT CHECKLIST**

### Requisitos

- [ ] Docker instalado (versión 20.10+)
- [ ] Docker Compose instalado (versión 2.0+)
- [ ] Redis (incluido en docker-compose)
- [ ] API keys de LLM providers (Groq, OpenAI, Anthropic)
- [ ] Servidor con 4GB RAM mínimo, 2 CPUs
- [ ] Puerto 6379 (Redis) accesible internamente
- [ ] Puerto 8080 (API) accesible externamente

### Configuración

```bash
# 1. Clonar configuración de ejemplo
cp .env.example.production .env.production

# 2. Editar .env.production con tus credenciales
nano .env.production

# Required: Cambiar estas variables
REDIS_PASSWORD=<generar_password_seguro_32_chars>
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GRAFANA_PASSWORD=<password_seguro>
SLACK_WEBHOOK_URL=https://hooks.slack.com/... (opcional)
```

### Validación Pre-Deploy

```bash
# Verificar que Docker está funcionando
docker --version
docker-compose --version

# Verificar configuración
docker-compose -f docker-compose.production.yml config

# Verificar que los servicios pueden iniciar
docker-compose -f docker-compose.production.yml up -d --dry-run
```

---

## 🎯 **DEPLOYMENT PASO A PASO**

### Paso 1: Backup (Automático)

El script de deployment crea backup automáticamente:

```bash
./scripts/deploy_production.sh deploy

# Output esperado:
# [INFO] Checking prerequisites...
# [SUCCESS] Prerequisites check passed
# [INFO] Creating backup of current deployment...
# [SUCCESS] Backup created in ./backups/20260331_120000
```

**Backup location:** `./backups/YYYYMMDD_HHMMSS/`

---

### Paso 2: Canary Deployment (5% tráfico)

```bash
# El script automáticamente:
# 1. Deploya 1 instancia de AI Agent
# 2. Configura 5% del tráfico
# 3. Ejecuta health checks

[INFO] Deploying canary deployment (5% traffic)...
[INFO] Running health check for ai-agent...
[SUCCESS] ai-agent is healthy
[SUCCESS] Canary deployment successful
```

**Duración:** 1-2 minutos

---

### Paso 3: Monitoreo de Canary (1 hora)

```bash
# El script monitorea automáticamente por 1 hora:
[INFO] Canary monitoring: 60/3600 seconds
[INFO] Canary monitoring: 120/3600 seconds
...
[INFO] Canary monitoring: 3600/3600 seconds
[SUCCESS] Canary monitoring completed successfully
```

**Métricas a verificar durante canary:**

```bash
# Ver status del deployment
./scripts/deploy_production.sh status

# Ver logs en tiempo real
./scripts/deploy_production.sh logs

# Ver métricas de Redis (cache hit rate)
docker exec booking-redis redis-cli INFO stats | grep keyspace

# Ver health de containers
docker-compose -f docker-compose.production.yml ps
```

**Thresholds de éxito:**
- Error rate < 5%
- Latencia P95 < 10s
- Cache hit rate > 20%
- 0 alertas críticas

---

### Paso 4: Full Rollout (100% tráfico)

```bash
# Si canary fue exitoso, el script automáticamente:
[INFO] Canary monitoring passed, proceeding to full rollout...
[INFO] Starting full rollout (100% traffic)...
docker-compose -f docker-compose.production.yml up -d --scale ai-agent=3

[SUCCESS] Full rollout successful
```

**Escalado:** 1 → 3 instancias

---

### Paso 5: Post-Deploy Monitoring (24 horas)

```bash
# Monitorear durante 24 horas:

# 1. Verificar métricas cada hora
watch -n 3600 './scripts/deploy_production.sh status'

# 2. Verificar logs de errores
docker-compose -f docker-compose.production.yml logs --tail=100 | grep -i error

# 3. Verificar cache hit rate
docker exec booking-redis redis-cli INFO stats | grep keyspace_hits

# 4. Verificar Prometheus (si está habilitado)
open http://localhost:9090

# 5. Verificar Grafana dashboards
open http://localhost:3000
```

---

## 🚨 **ROLLBACK AUTOMÁTICO**

### Rollback Manual

```bash
# Si algo sale mal durante deployment:
./scripts/deploy_production.sh rollback

# Output esperado:
# [WARNING] Starting rollback...
# [INFO] Stopping current deployment...
# [INFO] Restoring from backup: 20260331_120000
# [SUCCESS] Rollback completed
```

### Rollback Automático

El script hace rollback automáticamente si:
- Canary health check falla (3 retries)
- Canary monitoring detecta errores > 5%
- Full rollout falla

---

## 📊 **MÉTRICAS DE ÉXITO**

### Durante Deployment

| Métrica | Threshold | Acción si falla |
|---------|-----------|-----------------|
| **Health Check** | 3/3 passes | Rollback automático |
| **Error Rate** | < 5% | Rollback si > 5% por 5 min |
| **Latencia P95** | < 10s | Investigar si > 10s |
| **Cache Hit Rate** | > 20% | Ajustar threshold si < 20% |

### Post-Deployment (24 horas)

| Métrica | Objetivo | Actual Esperado |
|---------|----------|-----------------|
| **Disponibilidad** | 99.9% | 99.9% |
| **Latencia P50** | < 500ms | 350ms |
| **Latencia P95** | < 1000ms | 800ms |
| **Cache Hit Rate** | > 20% | 30% |
| **Error Rate** | < 1% | 0.5% |
| **Costo Diario** | < $50 | $27 |

---

## 🔧 **COMANDOS DE MANTENIMIENTO**

### Ver Status

```bash
# Status del deployment
./scripts/deploy_production.sh status

# Ver containers
docker-compose -f docker-compose.production.yml ps

# Ver logs
docker-compose -f docker-compose.production.yml logs -f ai-agent

# Ver métricas de Redis
docker exec booking-redis redis-cli INFO
```

### Reiniciar Servicios

```bash
# Reiniciar AI Agent
docker-compose -f docker-compose.production.yml restart ai-agent

# Reiniciar Redis (pérdida de cache)
docker-compose -f docker-compose.production.yml restart redis

# Reiniciar todo
docker-compose -f docker-compose.production.yml restart
```

### Limpieza

```bash
# Limpieza automática (post-deploy)
./scripts/deploy_production.sh deploy

# Limpieza manual
docker system prune -f --volumes
docker image prune -f

# Ver espacio en disco
docker system df
```

### Backups

```bash
# Listar backups
ls -la ./backups/

# Restaurar backup específico
BACKUP_DIR=./backups/20260331_120000
# (Restaurar manualmente desde directorio de backup)

# Eliminar backups antiguos (> 7 días)
find ./backups -type d -mtime +7 -exec rm -rf {} \;
```

---

## 🐛 **TROUBLESHOOTING**

### Problema: Canary deployment falla

**Síntomas:**
```
[ERROR] ai-agent health check failed (attempt 1/3)
```

**Causas posibles:**
1. API keys inválidas
2. Redis no accesible
3. Puerto 8080 ocupado

**Solución:**
```bash
# Verificar logs de error
docker-compose -f docker-compose.production.yml logs ai-agent

# Verificar conexión a Redis
docker exec booking-redis redis-cli ping

# Verificar puerto 8080
netstat -tulpn | grep 8080

# Verificar variables de entorno
docker-compose -f docker-compose.production.yml config
```

---

### Problema: Cache hit rate bajo (< 10%)

**Síntomas:**
```
redis-cli INFO stats | grep keyspace_hits
keyspace_hits:100
keyspace_misses:900
hit_rate: 0.10 (10%)
```

**Causas posibles:**
1. TTL muy corto
2. Threshold de similitud muy alto
3. Poco tráfico repetido

**Solución:**
```bash
# Aumentar TTL en .env.production
CACHE_TTL=14400  # 4 horas

# Reducir threshold de similitud
SIMILARITY_THRESHOLD=0.90

# Reiniciar AI Agent
docker-compose -f docker-compose.production.yml restart ai-agent
```

---

### Problema: Circuit breaker se abre frecuentemente

**Síntomas:**
```
[WARNING] Circuit breaker OPEN for provider: groq
```

**Causas posibles:**
1. Provider inestable
2. Rate limit excedido
3. Timeout muy corto

**Solución:**
```bash
# Aumentar max failures en .env.production
CIRCUIT_BREAKER_MAX_FAILURES=10

# Aumentar timeout
CIRCUIT_BREAKER_TIMEOUT=120

# Verificar rate limits del provider
curl -I https://api.groq.com/openai/v1/models

# Reiniciar deployment
./scripts/deploy_production.sh deploy
```

---

### Problema: Costos más altos de lo esperado

**Síntomas:**
```
[WARNING] Cost per request $0.015 exceeds threshold $0.01
```

**Causas posibles:**
1. Cache no efectivo
2. Provider más caro seleccionado
3. Prompts muy largos

**Solución:**
```bash
# Verificar distribución de providers
# (debería ser 80% Groq, 15% OpenAI, 5% Anthropic)
docker-compose -f docker-compose.production.yml logs ai-agent | grep "Provider:"

# Optimizar prompts (max 500 tokens)
# Ver logs de AI Agent

# Aumentar cache effectiveness
SIMILARITY_THRESHOLD=0.90
CACHE_TTL=7200
```

---

## 📞 **SOPORTE Y ESCALAMIENTO**

### Niveles de Soporte

| Nivel | Descripción | Acción |
|-------|-------------|--------|
| **L1** | Error rate > 5% | Monitorear por 15 min |
| **L2** | Error rate > 10% por 30 min | Rollback parcial (50%) |
| **L3** | Error rate > 20% por 1 hora | Rollback completo |
| **CRITICAL** | Servicio caído | Rollback + page on-call |

### Contactos de Emergencia

```bash
# Slack channel (configurar en .env.production)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# PagerDuty (integrar manualmente)
# Email alerts (configurar en monitoring/prometheus.yml)
```

---

## ✅ **POST-DEPLOYMENT CHECKLIST**

### Inmediato (0-1 horas)

- [ ] Verificar health checks passing
- [ ] Verificar 0 errores críticos en logs
- [ ] Verificar cache hit rate > 20%
- [ ] Verificar latencia P95 < 10s

### Corto Plazo (1-24 horas)

- [ ] Monitorear métricas cada hora
- [ ] Verificar 0 alertas críticas
- [ ] Verificar costos dentro de presupuesto
- [ ] Documentar lecciones aprendidas

### Largo Plazo (1-7 días)

- [ ] Revisar tendencias de métricas
- [ ] Ajustar thresholds si necesario
- [ ] Optimizar cache configuration
- [ ] Planear próxima iteración

---

## 📚 **REFERENCIAS**

### Documentación Relacionada

- `docs/PRODUCTION_DEPLOYMENT_GUIDE.md` - Guía completa de producción
- `docs/AI_AGENT_V2.3_IMPROVEMENTS.md` - Mejoras de v2.3
- `docs/LLM_BEST_PRACTICES_RESEARCH_REPORT.md` - Investigación completa

### Scripts

- `scripts/deploy_production.sh` - Deployment automatizado
- `docker-compose.production.yml` - Configuración Docker
- `.env.example.production` - Configuración de ejemplo

### Monitoreo

- Prometheus: http://localhost:9090 (si habilitado)
- Grafana: http://localhost:3000 (si habilitado)
- Redis CLI: `docker exec booking-redis redis-cli`

---

**Estado:** ✅ **LISTO PARA DEPLOY**  
**Versión:** 2.3.0  
**Próximo:** Ejecutar `./scripts/deploy_production.sh deploy`
