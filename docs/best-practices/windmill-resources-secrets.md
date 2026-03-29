# Resource Types y Variables Secretas en Windmill - Best Practices

## Recursos vs Variables

### Diferencias Clave

| Característica | **Resources** | **Variables** |
|----------------|---------------|---------------|
| **Propósito** | Conexiones estructuradas a sistemas externos | Valores simples reutilizables (secrets) |
| **Estructura** | JSON Schema con múltiples campos | Key-value simple |
| **Ejemplos** | PostgreSQL, Redis, GCal, Telegram | API_KEY, DB_PASSWORD, JWT_SECRET |
| **Path** | `u/user/my-db`, `f/folder/resource` | `u/user/MY_VAR`, `f/folder/MY_VAR` |
| **Encryption** | ✅ Campos sensibles encriptados | ✅ Valor encriptado AES-256 |
| **Referencia** | Pasar como parámetro o `wmill.getResource()` | `$var:MY_VAR` en Resources |

### Cuándo Usar Cada Uno

```
✅ Usar RESOURCE cuando:
- Conexión a base de datos (host, port, user, password, dbname)
- API externa con múltiples parámetros (base_url, api_key, timeout)
- OAuth credentials (client_id, client_secret, token, refresh_token)
- Configuración estructurada compleja

✅ Usar VARIABLE cuando:
- API key simple (GROQ_API_KEY, OPENAI_API_KEY)
- Contraseña reutilizable en múltiples resources
- Token JWT o secret de signing
- Valor que rota frecuentemente (cambiar en un solo lugar)
```

### Ejemplo: Resource con Variable Referenciada

```
┌─────────────────────────────────────────────────────────────┐
│  Resource: f/resources/booking-db (PostgreSQL)              │
├─────────────────────────────────────────────────────────────┤
│  host:     postgres.booking-network.svc                     │
│  port:     5432                                             │
│  user:     booking                                          │
│  password: $var:DB_PASSWORD          ← Variable referenciada│
│  dbname:   bookings                                         │
│  sslmode:  require                                          │
└─────────────────────────────────────────────────────────────┘
```

**Ventaja:** Rotar `DB_PASSWORD` en un solo lugar, se actualiza en todos los resources que lo referencian.

## Resource Types (RT)

### Tipos Built-in

| Resource Type | Campos Principales | Uso |
|---------------|-------------------|-----|
| **RT.Postgresql** | host, port, user, password, dbname, sslmode | Base de datos principal |
| **RT.Redis** | url, password, db, tls | Cache, locks, sesiones |
| **RT.Gcal** | token | Google Calendar OAuth |
| **RT.Gmail** | token | Gmail API OAuth |
| **RT.Telegram** | bot_token | Telegram Bot API |
| **RT.Groq** | api_key, base_url | Groq LLM API |
| **RT.Openai** | api_key, base_url, organization_id | OpenAI API |
| **RT.S3** | endpoint, bucket, access_key, secret_key, region | Almacenamiento objetos |

### Generar RT Namespace para TypeScript

```bash
# Generar rt.d.ts desde resource types del workspace
wmill resource-type generate-namespace

# Output: rt.d.ts
```

**rt.d.ts generado:**
```typescript
declare namespace RT {
  type Postgresql = {
    host: string;
    port: number;
    user: string;
    password: string;
    dbname: string;
    sslmode: string;
    root_certificate_pem?: string;
  };

  type Redis = {
    url: string;
    password?: string;
    db?: number;
    tls?: boolean;
  };

  type Telegram = {
    bot_token: string;
  };

  type Gcal = {
    token: string;
  };

  type Groq = {
    api_key: string;
    base_url?: string;
  };

  // ... más tipos
}
```

### Uso en Scripts TypeScript/Bun

```typescript
import * as wmill from "windmill-client";

// Resource pasado como parámetro (type-safe)
export async function main(db: RT.Postgresql) {
    // wmill obtiene connection string del resource
    const connStr = await wmill.databaseUrlFromResource(db);
    
    // Usar con node-postgres
    const client = new Client(connStr);
    await client.connect();
    
    try {
        const result = await client.query('SELECT 1');
        return { success: true, rows: result.rows };
    } finally {
        await client.end();
    }
}

// Múltiples resources
export async function main(
    db: RT.Postgresql,
    redis: RT.Redis,
    telegram: RT.Telegram
) {
    // Acceder a cada resource
    const dbConn = await connectToDb(db);
    const redisClient = await connectToRedis(redis);
    await sendTelegramMessage(telegram.bot_token, chatId, text);
}
```

### Uso en Scripts Go

```go
package inner

import (
    "database/sql"
    "fmt"
    
    _ "github.com/lib/pq"
)

// Struct que matchea RT.Postgresql
type Postgresql struct {
    Host     string `json:"host"`
    Port     int    `json:"port"`
    User     string `json:"user"`
    Password string `json:"password"`
    DBName   string `json:"dbname"`
    SSLMode  string `json:"sslmode"`
}

// Resource pasado como parámetro
func main(ctx context.Context, db Postgresql) (map[string]any, error) {
    // Construir connection string
    connStr := fmt.Sprintf(
        "host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
        db.Host, db.Port, db.User, db.Password, db.DBName, db.SSLMode,
    )
    
    // Conectar
    dbConn, err := sql.Open("postgres", connStr)
    if err != nil {
        return nil, err
    }
    defer dbConn.Close()
    
    // Usar...
    return map[string]any{"status": "connected"}, nil
}
```

## Paths y Permisos

### Estructura de Paths

```
┌─────────────────────────────────────────────────────────────┐
│  User Space: u/<user>/<path>                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  u/alice/postgresql-main       ← Alice owns           │ │
│  │  u/alice/telegram-bot          ← Alice owns           │ │
│  │  u/bob/gcal-primary            ← Bob owns             │ │
│  └───────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Folder Space: f/<folder>/<path>                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  f/booking/resources/db-main    ← Folder permissions  │ │
│  │  f/booking/resources/redis      ← Folder permissions  │ │
│  │  f/shared/telegram-bot          ← Shared folder       │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Niveles de Acceso (ACL)

| Rol | Ver | Editar | Archivar | Borrar | Compartir |
|-----|-----|--------|----------|--------|-----------|
| **Admin (Owner)** | ✅ | ✅ | ✅ | ❌* | ✅ |
| **Writer** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Viewer** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Workspace Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |

*\* Solo Workspace Admins pueden borrar permanentemente*

### Compartir Resources

```
Dashboard → Resources → f/booking/db-main → Share

┌─────────────────────────────────────────────────────────────┐
│  Share Resource: f/booking/db-main                          │
├─────────────────────────────────────────────────────────────┤
│  Add users or groups:                                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ @booking-team          [Writer ▼]  [Remove]          │ │
│  │ @dev-team              [Viewer ▼]  [Remove]          │ │
│  │ alice@company.com      [Admin ▼]   [Remove]          │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  [Add user/group]                                           │
└─────────────────────────────────────────────────────────────┘
```

### Workspace Protection

```yaml
# Enterprise feature: Protection rulesets
# Settings → Workspace Protection → Add Ruleset

rules:
  # Prevenir borrar resources críticos
  - path: f/booking/resources/*
    action: delete
    roles: [workspace_admin]
  
  # Prevenir cambios en producción
  - path: f/production/*
    action: edit
    roles: [workspace_admin]
    require_approval: true
```

## Rotación de Secrets

### Estrategia de Rotación

| Secret Type | Frecuencia | Método |
|-------------|------------|--------|
| **API Keys** | 90 días | Regenerar en provider, actualizar Variable |
| **DB Passwords** | 60 días | Cambiar en DB, actualizar Variable |
| **OAuth Tokens** | Según expiry | Refresh automático o manual |
| **JWT Secrets** | 180 días | Regenerar, redeploy si es necesario |

### Proceso de Rotación (API Key)

```bash
# 1. Identificar resources que usan la variable
# Dashboard → Variables → GROQ_API_KEY → Usage

# Resources usando esta variable:
# - f/resources/groq-main
# - f/resources/groq-fallback
```

**Pasos:**
```
1. Generar nueva API key en Groq Dashboard
2. Windmill → Variables → GROQ_API_KEY → Edit
3. Actualizar valor (encriptado automáticamente)
4. Testear scripts que usan el resource
5. Eliminar old key en Groq Dashboard (después de confirmar)
```

### Rotación Automática con Script

```typescript
// f/scripts/rotate-groq-key/main.ts
import * as wmill from "windmill-client";

export async function main() {
    // 1. Generar nueva key (llamar API de Groq)
    const newKey = await generateNewGroqKey();
    
    // 2. Actualizar variable
    await wmill.setVariable("GROQ_API_KEY", newKey);
    
    // 3. Notificar por Slack/Telegram
    await notifyRotation("GROQ_API_KEY", new Date().toISOString());
    
    return { success: true, rotated_at: new Date() };
}

// Schedule: Ejecutar cada 90 días
```

### Auditoría de Rotación

```sql
-- Query audit logs para ver cuándo se accedió/actualizó un secret
SELECT 
    created_at,
    user_email,
    action,
    resource_path,
    details
FROM audit_logs
WHERE resource_path LIKE 'f/booking/resources/%'
   OR details LIKE '%GROQ_API_KEY%'
ORDER BY created_at DESC
LIMIT 100;
```

## Auditoría y Compliance

### Audit Logs

**Qué se loggea:**
- ✅ Creación/edición/borrado de Resources
- ✅ Creación/edición/borrado de Variables
- ✅ Acceso a secrets (quién, cuándo, qué resource)
- ✅ Ejecuciones de scripts/flows
- ✅ Cambios de permisos/ACL
- ✅ Login/logout de usuarios

**Acceso a Logs:**
```
Dashboard → Settings → Audit Logs

┌─────────────────────────────────────────────────────────────┐
│  Audit Logs                                                 │
├─────────────────────────────────────────────────────────────┤
│  Filters:                                                   │
│  [Date Range ▼] [User ▼] [Action Type ▼] [Resource ▼]      │
├─────────────────────────────────────────────────────────────┤
│  2026-03-27 10:15:32 | alice@co.com | UPDATE | f/resources/db-main │
│  Updated password field (secret rotated)                    │
├─────────────────────────────────────────────────────────────┤
│  2026-03-27 09:45:12 | bob@co.com | CREATE | f/resources/redis   │
│  Created new Redis resource                                 │
├─────────────────────────────────────────────────────────────┤
│  2026-03-27 08:30:00 | system | EXECUTE | f/booking/create    │
│  Script executed by schedule                                │
└─────────────────────────────────────────────────────────────┘
```

### Retención de Logs

| Edición | Retención Default | Retención Máxima |
|---------|-------------------|------------------|
| **Cloud** | 30 días | 90 días (Enterprise) |
| **Self-Hosted** | Configurable | Ilimitada (según storage) |

### Exportar Logs para Compliance

```bash
# API endpoint para exportar audit logs
curl -X GET "https://app.windmill.dev/api/audit-logs" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2026-01-01",
    "end_date": "2026-03-31",
    "resource_path": "f/booking/*"
  }'
```

## Seguridad

### Encryption

| Estado | Método |
|--------|--------|
| **At Rest** | AES-256 |
| **In Transit** | TLS 1.3 |
| **Workspace Key** | Unique per workspace |
| **Key Rotation** | Re-encrypt all secrets on key change |

### Best Practices de Seguridad

```
✅ DO:
- Usar Variables para secrets, referenciar en Resources
- Paths en f/folder/ para recursos compartidos (no u/user/)
- Compartir con grupos (@team), no usuarios individuales
- Rotar secrets cada 90 días mínimo
- Audit logs habilitados para compliance
- Workspace protection rules para producción

❌ DON'T:
- Hardcodear secrets en scripts
- Usar u/user/ para recursos de producción
- Compartir con "Everyone" o "All users"
- Mismo secret en múltiples workspaces
- Logs de secrets en stdout (wmill los enmascara automáticamente)
```

### Run on Behalf Of

```
Configuración crítica para compartmentalización:

Script/Flow → Settings → Run on behalf of:

┌─────────────────────────────────────────────────────────────┐
│  Run on behalf of:                                          │
│  [ billing-bot ▼ ]  ← Virtual user                          │
├─────────────────────────────────────────────────────────────┤
│  billing-bot tiene acceso SOLO a:                           │
│  - f/billing/resources/*                                    │
│  - f/billing/scripts/*                                      │
│                                                             │
│  Si el script falla o es comprometido:                      │
│  - NO puede acceder a f/booking/*                           │
│  - NO puede acceder a f/production/*                        │
│  - El blast radius está limitado                           │
└─────────────────────────────────────────────────────────────┘
```

## Errores Comunes

### ❌ Hardcodear Secrets en Scripts

```typescript
// MAL: Secret expuesto en código
const API_KEY = "sk-1234567890abcdef";

// BIEN: Usar Resource o Variable
export async function main(groq: RT.Groq) {
    const apiKey = groq.api_key;  // Inyectado automáticamente
}
```

### ❌ Usar u/user/ para Producción

```
// MAL: Resource en espacio personal
u/alice/production-db

// Si Alice deja la empresa → problema de acceso

// BIEN: Resource en folder compartido
f/production/resources/db-main
```

### ❌ Mismo Secret en Múltiples Workspaces

```
// MAL: Copiar mismo secret
Workspace A: GROQ_API_KEY = "sk-abc123"
Workspace B: GROQ_API_KEY = "sk-abc123"  // Mismo!

// BIEN: Secrets diferentes por workspace
Workspace A (dev): GROQ_API_KEY = "sk-dev-xxx"
Workspace B (prod): GROQ_API_KEY = "sk-prod-yyy"
```

### ❌ No Rotar Secrets

```
// MAL: Secret sin rotar por 2 años
Created: 2024-01-01
Last rotated: NEVER

// BIEN: Rotación cada 90 días
Created: 2024-01-01
Last rotated: 2026-03-27
Next rotation: 2026-06-27 (scheduled)
```

### ❌ Logs de Secrets

```go
// MAL: Loggear secret (wmill lo enmascara, pero no confiar)
fmt.Printf("DB Password: %s\n", db.Password)

// BIEN: Loggear sin secrets
fmt.Printf("Connected to DB: %s@%s:%d\n", db.User, db.Host, db.Port)
```

## Checklist Producción

- [ ] Resources en f/folder/ (no u/user/)
- [ ] Variables para secrets, referenciadas en Resources
- [ ] RT namespace generado (rt.d.ts) para TypeScript
- [ ] Scripts usan type-safe RT types
- [ ] ACL configurado por grupo (no usuarios individuales)
- [ ] Workspace protection rules para producción
- [ ] Audit logs habilitados
- [ ] Schedule de rotación de secrets (90 días)
- [ ] Run on behalf of configurado para scripts críticos
- [ ] Secrets diferentes por ambiente (dev/staging/prod)
- [ ] No hardcoding en scripts
- [ ] Logs sin secrets
