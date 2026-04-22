# 🔒 Seguridad de Credenciales — Guía de Producción

## ⚠️ CRÍTICO: El .env actual es inseguro

**Estado actual:** 
- ✅ `.env` está en `.gitignore`
- ❌ **Pero contiene credenciales de producción en TEXTO PLANO**
- ❌ **Accesible a cualquiera con acceso al servidor**

---

## 🔐 Solución: Usar Secretos de Windmill

Windmill proporciona un sistema seguro de gestión de secretos que es **mejor que variables en .env**.

### Paso 1: Crear Secretos en Windmill UI

1. **Login en Windmill:** https://titanium.stax.ink/
2. **Ir a:** Settings → Workspace → Resources
3. **Crear recurso `postgresql`:**
   ```
   Name: neon_db
   Type: postgresql
   Host: ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech
   Port: 5432
   User: neondb_owner
   Password: npg_qxXSa8VnUo0i
   Database: neondb
   ```
   → Windmill lo encripta y almacena **seguro**

4. **Crear recurso `rest`:**
   ```
   Name: telegram_api
   Type: rest (custom)
   Headers: {"Authorization": "Bearer 8581822135:AAEZQ6azDAbZOT17DHrKVtVyU-P7uh7HIgM"}
   ```

5. **Crear variables de entorno:**
   ```
   Name: OPENAI_API_KEY
   Value: sk-proj-cxipxBoVYvxswjub_lZNjf9EU8Uf0DARmNr_QiijB6ca...
   Secret: YES (cifrado)
   ```

### Paso 2: Referencias en Scripts

En lugar de:
```typescript
const apiKey = process.env.OPENAI_API_KEY;
```

Usa variables de Windmill (automáticamente inyectadas):
```typescript
// En Windmill UI, pasar como input:
interface Input {
  openai_api_key: string; // Windmill lo pasa desde el secreto
}
```

### Paso 3: Variables de Entorno Locales (Dev Only)

Para desarrollo local, aún necesitas `.env`, pero **NUNCA commites credenciales reales**:

```bash
# .env (development only, NEVER commit real credentials)
DATABASE_URL=postgresql://localhost:5432/windmill_dev
OPENAI_API_KEY=sk-test-xxx  # Use test keys for local dev
TELEGRAM_BOT_TOKEN=123456:AAAAA  # Use bot in test group
GROQ_API_KEY=gsk-test-xxx
```

---

## 📋 Migración: De .env a Secretos Windmill

### Fase 1: Auditar Credenciales Actuales ✅

```bash
# Ver qué está en .env (PELIGRO: credenciales expuestas)
cat .env | grep -E "KEY|TOKEN|PASSWORD|SECRET"
```

**Resultado:**
- `OPENAI_API_KEY` ← **Expuesto en servidor**
- `TELEGRAM_BOT_TOKEN` ← **Expuesto en servidor**
- `GCALENDAR_CLIENT_SECRET` ← **Expuesto en servidor**

### Fase 2: Crear Secretos en Windmill

Ya completado en "Paso 1" arriba.

### Fase 3: Verificar No Hay Filtración

```bash
# Buscar credenciales en git history
git log -p --all | grep -E "OPENAI_API_KEY|TELEGRAM_BOT_TOKEN" | head -5

# Resultado: Si aparece algo, las credenciales fueron expuestas en commit anterior
# Solución: Revocar token en Google Cloud / Telegram BotFather / OpenAI
```

### Fase 4: Limpiar .env Local

```bash
# Nunca commites el .env con credenciales reales
# En su lugar, documenta qué variables son necesarias:
# Ver .env.example
```

---

## 🛡️ Best Practices por Servicio

### Google Calendar (OAuth)
- ✅ Almacena tokens en **Windmill Resources** (encrypted)
- ❌ Nunca hardcodees `GCAL_ACCESS_TOKEN` en script
- ✅ Implementa refresh logic: ver `f/gcal_sync/main.ts`

### Telegram Bot Token
- ✅ Guardar en **Windmill variable (secret)**: `TELEGRAM_BOT_TOKEN`
- ✅ Accede como: `$secrets.TELEGRAM_BOT_TOKEN`
- ❌ Nunca logues el token completo

### OpenAI / Groq Keys
- ✅ Una variable per proveedor en Windmill
- ✅ Rotación anual automática
- ✅ Monitor: `f/nlu/constants.ts` define thresholds de timeout

### PostgreSQL (Neon)
- ✅ Usa **Windmill Resource postgresql**
- ✅ Se conecta via `neon_db` resource (encrypted)
- ❌ Nunca pases DATABASE_URL en request body

---

## 🔄 Sincronización de Secretos Entre Ambientes

**Problema:** Secretos en Dev ≠ Secretos en Prod

**Solución: Usar Windmill Workspaces**

```yaml
# wmill.yaml
workspaces:
  booking-titanium:
    baseUrl: https://titanium.stax.ink/
    # Mantener secretos aislados por workspace
    # No syncar secretos en git
  booking-titanium-staging:
    baseUrl: https://staging.titanium.stax.ink/
    # Staging tiene sus propios secretos (test keys)
  booking-titanium-prod:
    baseUrl: https://prod.titanium.stax.ink/
    # Prod tiene credenciales reales (rotadas regularmente)
```

---

## ✅ Checklist de Seguridad Pre-Producción

- [ ] **Eliminar credenciales de .env** — Usar Windmill Secrets en su lugar
- [ ] **Revocar tokens expuestos** — OpenAI, Groq, Telegram, Google
- [ ] **Auditar git history** — No hay commits con credenciales
- [ ] **Usar HTTPS en Windmill** — SSL/TLS configurado en Caddyfile
- [ ] **Activar autenticación** — En Windmill UI (invite users)
- [ ] **Monitorear logs** — Ver si hay logs con credenciales
- [ ] **Rotar secretos regularmente** — Mensual para APIs críticas
- [ ] **Test credentials** — Usar test keys localmente, reales en prod

---

## 🚨 Si Una Credencial Fue Expuesta

1. **Inmediato:**
   - Revocar en plataforma original (OpenAI, Google, Telegram)
   - Generar nuevo token/key
   - Actualizar en Windmill Secrets
   - Verificar logs de acceso no autorizado

2. **Documentar:**
   ```bash
   git log --all --grep="exposed" --oneline
   # Investigar qué commits la contienen
   ```

3. **Prevención futura:**
   - Usar `pre-commit` hook para detectar credenciales
   - Instrucción en .gitignore más clara
   - Entrenar equipo en seguridad

---

## 📞 Referencias

- [Windmill Secrets Documentation](https://windmill.dev/docs/core_concepts/resources_and_variables)
- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [GitHub: Removing Sensitive Data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

---

**Última actualización:** 2026-04-21  
**Status:** 🟡 En transición (`.env` actual necesita limpieza)
