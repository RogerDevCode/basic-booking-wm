# Scripts Go en Windmill - Best Practices

## Estructura de un Script Go

### Package y Función Main

```go
package inner

import (
    "fmt"
    "time"
)

// Main function con parámetros tipados
func main(
    name string,
    age int,
    providerID int,
    startTime string,
) (map[string]any, error) {
    // Logging con fmt.Println (capturado en UI)
    fmt.Println("Starting script execution...")
    fmt.Printf("Processing booking for %s\n", name)
    
    // Lógica del script
    result := map[string]any{
        "status": "success",
        "data": map[string]any{
            "provider_id": providerID,
            "processed_at": time.Now().UTC(),
        },
    }
    
    return result, nil
}
```

### Reglas Clave

| Elemento | Requisito | Ejemplo |
|----------|-----------|---------|
| **Package** | `package inner` | Requerido para todos los scripts |
| **Func Main** | `func main(...) (T, error)` | T = cualquier tipo serializable |
| **Return** | `(result, error)` | `map[string]any` recomendado |
| **Parámetros** | Argumentos de main | Auto-generan UI/form |
| **Logging** | `fmt.Println` | Capturado en logs de Windmill |

### Tipos de Retorno Válidos

```go
// ✅ map[string]any (recomendado)
func main() (map[string]any, error) {
    return map[string]any{"key": "value"}, nil
}

// ✅ Struct tipado
type Result struct {
    Status string `json:"status"`
    Data   any    `json:"data"`
}

func main() (Result, error) {
    return Result{Status: "ok"}, nil
}

// ✅ Slice
func main() ([]map[string]any, error) {
    return []map[string]any{{"id": 1}}, nil
}
```

## Resource Types (RT)

### Usar Recursos como Parámetros

```go
package inner

import (
    "database/sql"
    "fmt"
    _ "github.com/lib/pq"
)

// Resource Type PostgreSQL definido como struct
type Postgresql struct {
    Host     string `json:"host"`
    Port     int    `json:"port"`
    User     string `json:"user"`
    Password string `json:"password"`
    DBName   string `json:"dbname"`
    SSLMode  string `json:"sslmode"`
}

// El recurso se pasa como parámetro
func main(db Postgresql, query string) (map[string]any, error) {
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
    
    // Ejecutar query
    rows, err := dbConn.Query(query)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    // Procesar resultados
    var results []map[string]any
    for rows.Next() {
        // ... scan logic
    }
    
    return map[string]any{"rows": results}, nil
}
```

### Resource Type Redis

```go
type Redis struct {
    URL      string `json:"url"`
    Password string `json:"password"`
    DB       int    `json:"db"`
    TLS      bool   `json:"tls"`
}

func main(redis Redis, key string) (string, error) {
    // Construir URL si no está completa
    url := redis.URL
    if url == "" {
        url = fmt.Sprintf("redis://:%s@localhost:6379/%d", redis.Password, redis.DB)
    }
    
    // Usar con go-redis
    // ... conexión y operaciones
    
    return "value", nil
}
```

### Referenciar Recursos en Windmill UI

1. Ir a **Resources** en Windmill
2. Click **+ New Resource**
3. Seleccionar tipo: `PostgreSQL`, `Redis`, etc.
4. Llenar campos (host, port, credentials)
5. Path: `f/resources/booking-db`
6. En script: seleccionar recurso en panel derecho → se pasa automáticamente

## Variables de Entorno y Secrets

### GetVariable desde Código

```go
package inner

import (
    "os"
)

func main() (map[string]any, error) {
    // Variables de entorno estándar
    apiKey := os.Getenv("GROQ_API_KEY")
    dbURL := os.Getenv("DATABASE_URL")
    
    // Variables de Windmill (inyectadas como env vars)
    workspace := os.Getenv("WM_WORKSPACE")
    token := os.Getenv("WM_TOKEN")
    
    return map[string]any{
        "api_key_set": apiKey != "",
        "workspace": workspace,
    }, nil
}
```

### Variables en Windmill

```bash
# Configurar variables en UI: Variables → New Variable
# Path: f/variables/groq-key
# Value: gsk_xxx
# Secret: ✅ (enmascarado en logs)

# Referenciar en scripts:
# - Automáticamente disponibles como env vars
# - O usar $var:PATH en recursos
```

### Jerarquía de Variables

| Tipo | Scope | Ejemplo | Cuándo Usar |
|------|-------|---------|-------------|
| **Workspace Variable** | Todo el workspace | `GROQ_API_KEY` | Secrets compartidos |
| **Folder Variable** | Carpeta específica | `f/booking/api-key` | Secrets por proyecto |
| **User Variable** | Usuario específico | `u/alice/token` | Credenciales personales |
| **Resource Variable** | Recurso específico | `$res:f/resources/db` | Conexiones DB/API |

## Logging

### Logging Básico

```go
func main() (map[string]any, error) {
    // Info log
    fmt.Println("Starting booking process")
    
    // Debug log
    fmt.Printf("Provider ID: %d, Time: %s\n", providerID, startTime)
    
    // Warning (usar formato claro)
    fmt.Println("WARN: Circuit breaker is open, skipping GCal")
    
    // Error log (antes de retornar error)
    fmt.Printf("ERROR: Failed to create booking: %v\n", err)
    
    return result, err
}
```

### Logging Estructurado (Recomendado)

```go
import "encoding/json"

func logStructured(level string, message string, data map[string]any) {
    log := map[string]any{
        "level":     level,
        "message":   message,
        "timestamp": time.Now().UTC().Format(time.RFC3339),
    }
    
    // Merge data
    for k, v := range data {
        log[k] = v
    }
    
    jsonBytes, _ := json.Marshal(log)
    fmt.Println(string(jsonBytes))
}

// Uso
func main() (map[string]any, error) {
    logStructured("info", "booking_started", map[string]any{
        "provider_id": 1,
        "chat_id": "123456",
    })
    
    // ... lógica
    
    return result, nil
}
```

### Niveles de Log

| Nivel | Cuándo Usar | Ejemplo |
|-------|-------------|---------|
| **INFO** | Inicio/fin de operaciones | "Booking created successfully" |
| **DEBUG** | Detalles para debugging | "Query executed in 45ms" |
| **WARN** | Problemas no críticos | "GCal event delayed, retrying" |
| **ERROR** | Fallos de operación | "Failed to acquire lock" |

## Retry Logic

### Exponential Backoff con Jitter

```go
import (
    "context"
    "fmt"
    "math"
    "math/rand"
    "time"
)

type RetryConfig struct {
    MaxRetries int
    BaseDelay  time.Duration
    MaxDelay   time.Duration
    Multiplier float64
}

func defaultRetryConfig() RetryConfig {
    return RetryConfig{
        MaxRetries: 3,
        BaseDelay:  100 * time.Millisecond,
        MaxDelay:   10 * time.Second,
        Multiplier: 2.0,
    }
}

// Retry con exponential backoff y jitter
func retryWithBackoff(
    ctx context.Context,
    config RetryConfig,
    operation func() error,
) error {
    var lastErr error
    
    for attempt := 0; attempt <= config.MaxRetries; attempt++ {
        // Check context cancellation
        if ctx.Err() != nil {
            return ctx.Err()
        }
        
        // Ejecutar operación
        lastErr = operation()
        if lastErr == nil {
            return nil // Éxito
        }
        
        // No reintentar si es error permanente
        if isPermanentError(lastErr) {
            return lastErr
        }
        
        // Calcular delay con exponential backoff
        delay := calculateBackoff(attempt, config)
        
        // Esperar con jitter
        select {
        case <-time.After(delay):
            // Continuar retry
        case <-ctx.Done():
            return ctx.Err()
        }
    }
    
    return fmt.Errorf("max retries exceeded: %w", lastErr)
}

func calculateBackoff(attempt int, config RetryConfig) time.Duration {
    // Fórmula: base * (multiplier ^ attempt)
    exp := math.Pow(config.Multiplier, float64(attempt))
    delay := float64(config.BaseDelay) * exp
    
    // Aplicar jitter (50% random)
    jitter := 0.5 + rand.Float64()*0.5
    delay *= jitter
    
    // Cap en MaxDelay
    if delay > float64(config.MaxDelay) {
        delay = float64(config.MaxDelay)
    }
    
    return time.Duration(delay)
}

func isPermanentError(err error) bool {
    // No reintentar errores 4xx (excepto 429)
    // No reintentar errores de validación
    // No reintentar si circuit breaker está open
    return false // Implementar según caso
}
```

### Uso en Scripts Windmill

```go
func main(ctx context.Context, providerID int) (map[string]any, error) {
    config := defaultRetryConfig()
    
    var result map[string]any
    err := retryWithBackoff(ctx, config, func() error {
        // Operación que puede fallar
        r, err := createBooking(providerID)
        result = r
        return err
    })
    
    if err != nil {
        return nil, err
    }
    
    return result, nil
}
```

### Cuándo Reintentar vs Fallar

| Error | Reintentar | Razón |
|-------|------------|-------|
| **Timeout de red** | ✅ Sí | Transitorio |
| **HTTP 429** | ✅ Sí (con backoff largo) | Rate limit |
| **HTTP 502/503/504** | ✅ Sí | Error temporal del servidor |
| **Serialization failure (40001)** | ✅ Sí | Conflict en DB |
| **HTTP 400/401/403/404** | ❌ No | Error del cliente |
| **Validación fallida** | ❌ No | Datos incorrectos |
| **Circuit breaker open** | ❌ No | Protección activa |

## Testing Local con wmill CLI

### Comandos Esenciales

```bash
# Preview de script (sin deploy)
wmill script preview f/mi-script/main.go \
  --data '{"provider_id": 1, "start_time": "2026-03-27T10:00:00Z"}'

# Run script (requiere instancia Windmill)
wmill script run f/mi-script/main.go \
  --data @input.json \
  --workspace booking-titanium

# Sync push (deploy)
wmill sync push --yes

# Dry run (ver cambios sin aplicar)
wmill sync push --dry-run

# Flow preview
wmill flow preview f/telegram-webhook__flow \
  --data '{"chat_id": "123", "text": "reservar cita"}'
```

### Estructura de Proyecto Local

```
booking-titanium-wm/
├── wmill.yaml              # Configuración de workspace
├── f/
│   ├── mi-script/
│   │   ├── main.go         # Script Go
│   │   ├── main.script.yaml # Auto-generado
│   │   └── main.script.lock # Dependencies lock
│   └── telegram-webhook__flow/
│       └── flow.yaml       # Flow definition
└── .env                    # Variables locales (no commitear)
```

### Configurar wmill.yaml

```yaml
# wmill.yaml
workspace: booking-titanium
remote: https://windmill.stax.ink
base_dir: f/
```

### Testing de Recursos Localmente

```bash
# 1. Configurar variables de entorno para recursos
export WM_DATABASE_URL="postgresql://user:pass@localhost:5432/bookings"
export WM_REDIS_URL="redis://localhost:6379"

# 2. Preview usa estas variables automáticamente
wmill script preview f/db-script/main.go --data '{"query": "SELECT 1"}'
```

### Debugging

```bash
# Verbose output
wmill script preview f/script/main.go --verbose

# Show diffs antes de push
wmill sync push --show-diffs --dry-run

# Logs en tiempo real (después de deploy)
wmill jobs logs <job_id> --follow
```

## Errores Comunes

### ❌ Package Incorrecto

```go
// MAL: Package main
package main

func main() {
    // No compila en Windmill
}

// BIEN: Package inner
package inner

func main() (map[string]any, error) {
    // Correcto
}
```

### ❌ No Retornar Error

```go
// MAL: Sin return de error
func main() map[string]any {
    return map[string]any{"ok": true}
}

// BIEN: Retornar error
func main() (map[string]any, error) {
    if err != nil {
        return nil, err
    }
    return result, nil
}
```

### ❌ Logging sin Formato

```go
// MAL: Difícil de debuggear
fmt.Println("Error occurred")

// BIEN: Con contexto
fmt.Printf("ERROR: Failed to acquire lock for provider=%d time=%s: %v\n",
    providerID, startTime, err)
```

### ❌ Retry sin Backoff

```go
// MAL: Retry inmediato (hammering)
for i := 0; i < 3; i++ {
    err := operation()
    if err == nil {
        break
    }
    // Sin delay!
}

// BIEN: Con backoff
for i := 0; i < 3; i++ {
    err := operation()
    if err == nil {
        break
    }
    time.Sleep(time.Duration(i*i) * 100 * time.Millisecond)
}
```

### ❌ No Manejar Context

```go
// MAL: Ignora cancellation
func operation() error {
    // Puede bloquear indefinidamente
}

// BIEN: Check context
func operation(ctx context.Context) error {
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
        // Continuar
    }
}
```

## Checklist Producción

- [ ] Package `inner`
- [ ] Func main con `(result, error)` return
- [ ] Parámetros tipados (auto-generan UI)
- [ ] Logging estructurado con fmt.Printf
- [ ] Recursos pasados como parámetros
- [ ] Retry con exponential backoff + jitter
- [ ] Context handling para cancellation
- [ ] Error handling específico (no solo `err != nil`)
- [ ] wmill.yaml configurado
- [ ] Variables de entorno para secrets
- [ ] Testing local con `wmill script preview`
