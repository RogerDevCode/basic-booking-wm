# 🔧 GUÍA DE CONFIGURACIÓN POSTGRESQL (NEON)

**Date:** 2026-03-28  
**Status:** ✅ **DOCUMENTACIÓN COMPLETA**

---

## 📋 FORMATO CORRECTO DEL URL DE NEON

### ✅ Formato Correcto

```bash
NEON_DATABASE_URL=postgresql://usuario:password@host:port/database?sslmode=require
```

### Ejemplo Real (Tu caso)

```bash
# Formato CORRECTO ✅
NEON_DATABASE_URL=postgresql://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require
```

### Componentes del URL

| Componente | Valor | Descripción |
|------------|-------|-------------|
| **Protocolo** | `postgresql://` | Indica el tipo de base de datos |
| **Usuario** | `neondb_owner` | User de Neon |
| **Password** | `npg_qxXSa8VnUo0i` | Password de Neon |
| **Host** | `ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech` | Endpoint de Neon |
| **Port** | `5432` | Puerto PostgreSQL |
| **Database** | `neondb` | Nombre de la base de datos |
| **SSL** | `require` | Requiere conexión SSL |

---

## ❌ FORMATOS INCORRECTOS (COMUNES)

### Error 1: Falta el protocolo

```bash
# INCORRECTO ❌
NEON_DATABASE_URL=ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432:neondb:neondb_owner:npg_qxXSa8VnUo0i

# Error: missing "=" after "..." in connection info string
```

### Error 2: Formato de string de conexión antiguo

```bash
# INCORRECTO ❌
NEON_DATABASE_URL=host=ep-small-bread... port=5432 dbname=neondb user=neondb_owner password=npg_qxXSa8VnUo0i

# Este formato SÍ funciona, pero es más largo
```

### Error 3: Falta sslmode

```bash
# Funciona pero NO recomendado ❌
NEON_DATABASE_URL=postgresql://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb

# Error: SSL required by Neon
```

---

## 🔍 VERIFICACIÓN DEL FORMATO

### Test Rápido

```bash
# 1. Verificar que empieza con postgresql://
echo $NEON_DATABASE_URL | grep "^postgresql://"

# Si retorna algo, el formato es correcto ✅
# Si no retorna nada, falta el protocolo ❌
```

### Test de Conexión

```bash
# Test con psql
psql "$NEON_DATABASE_URL" -c "SELECT version();"

# Expected: PostgreSQL version info
# Si falla: revisar el formato del URL
```

---

## 🛠️ CÓMO CORREGIR EL .ENV

### Opción 1: Editor de Texto (Recomendado)

```bash
# Abrir archivo
nano docker-compose/.env

# Buscar línea:
DATABASE_URL=...

# Agregar postgresql:// al inicio si falta:
DATABASE_URL=postgresql://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require

# Guardar: Ctrl+O, Enter
# Salir: Ctrl+X
```

### Opción 2: Comando sed (Rápido)

```bash
# Fix automático
cd /home/manager/Sync/wildmill-proyects/booking-titanium-wm

# Verificar si necesita fix
grep "^DATABASE_URL=" docker-compose/.env | grep -v "postgresql://"

# Si retorna algo, necesita fix
# Ejecutar:
sed -i 's|^DATABASE_URL=|DATABASE_URL=postgresql://|' docker-compose/.env
sed -i 's|^DATABASE_URL=|DATABASE_URL=postgresql://|' docker-compose.dev/.env

# Verificar fix
grep "^DATABASE_URL=" docker-compose/.env
```

### Opción 3: Reemplazo Manual

```bash
# 1. Copiar el URL actual
grep "DATABASE_URL" docker-compose/.env

# 2. Editar archivo
nano docker-compose/.env

# 3. Reemplazar toda la línea con:
DATABASE_URL=postgresql://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require

# 4. Guardar y salir
```

---

## 📝 ARCHIVOS .ENV A CORREGIR

### 1. docker-compose/.env (Producción)

```bash
# Current (puede estar incorrecto):
DATABASE_URL=ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432:neondb:neondb_owner:npg_qxXSa8VnUo0i

# Correcto ✅:
DATABASE_URL=postgresql://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require
```

### 2. docker-compose.dev/.env (Desarrollo)

```bash
# Mismo fix que producción
DATABASE_URL=postgresql://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require
```

---

## 🧪 TEST DESPUÉS DEL FIX

### Test 1: Verificar formato

```bash
cd /home/manager/Sync/wildmill-proyects/booking-titanium-wm

# Cargar variables
source ~/.bashrc

# Verificar formato
grep "DATABASE_URL" docker-compose/.env
# Debe empezar con postgresql:// ✅
```

### Test 2: Conexión directa

```bash
# Exportar variable
export DATABASE_URL=$(grep "^DATABASE_URL=" docker-compose/.env | cut -d'=' -f2)

# Test de conexión
psql "$DATABASE_URL" -c "SELECT 1 as test;"

# Expected:
#  test 
# ------
#     1
```

### Test 3: Connection tests

```bash
# Ejecutar tests
./bin/connection_tests

# Expected output:
# 📊 Testing PostgreSQL (NEON)...
#   ✅ PostgreSQL - Connected to PostgreSQL 17.8...
```

---

## 🔐 SSL/TLS CONFIGURATION

### Neon SSL Modes

| sslmode | Description | Recommended |
|---------|-------------|-------------|
| `disable` | No SSL | ❌ Never |
| `require` | SSL required | ✅ Yes |
| `verify-ca` | Verify CA | ✅ Yes |
| `verify-full` | Verify CA + hostname | ✅ Yes |

### Tu Configuración Actual

```bash
# En docker-compose/.env
DATABASE_URL=postgresql://...?sslmode=require

# ✅ Correcto para Neon
```

---

## 🚨 TROUBLESHOOTING

### Error: "missing '=' after..."

**Causa:** Falta el protocolo `postgresql://`

**Solución:**
```bash
# Agregar protocolo
sed -i 's|^DATABASE_URL=|DATABASE_URL=postgresql://|' docker-compose/.env
```

### Error: "SSL required"

**Causa:** Falta `?sslmode=require`

**Solución:**
```bash
# Agregar sslmode
sed -i 's|$|?sslmode=require|' docker-compose/.env
```

### Error: "Connection refused"

**Causa:** Host o puerto incorrecto

**Solución:**
```bash
# Verificar host
grep "DATABASE_URL" docker-compose/.env

# Debe contener: ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432
```

---

## ✅ CHECKLIST DE CONFIGURACIÓN

### Verificación del URL

- [ ] Empieza con `postgresql://`
- [ ] Contiene usuario: `neondb_owner`
- [ ] Contiene password: `npg_qxXSa8VnUo0i`
- [ ] Contiene host: `ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech`
- [ ] Contiene puerto: `5432`
- [ ] Contiene database: `neondb`
- [ ] Contiene SSL: `?sslmode=require`

### Archivos Corregidos

- [ ] `docker-compose/.env` - URL corregido
- [ ] `docker-compose.dev/.env` - URL corregido
- [ ] Tests pasan: `./bin/connection_tests`

---

## 📚 REFERENCIAS

### Documentación Oficial

- [Neon Connection Strings](https://neon.tech/docs/connect/connect-from-any-app)
- [PostgreSQL Connection Strings](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING)
- [PostgreSQL SSL Modes](https://www.postgresql.org/docs/current/libpq-ssl.html)

### Tu Configuración Actual

```bash
# Ver en tiempo real
grep "DATABASE_URL" /home/manager/Sync/wildmill-proyects/booking-titanium-wm/docker-compose/.env
grep "DATABASE_URL" /home/manager/Sync/wildmill-proyects/booking-titanium-wm/docker-compose.dev/.env
```

---

**Guide Date:** 2026-03-28  
**Status:** ✅ COMPLETE  
**Next:** Apply fix to .env files  
**Estimated Time:** 5 minutes
