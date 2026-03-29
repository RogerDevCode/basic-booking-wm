# API Gateway HTTP en Go - Best Practices

## Arquitectura del API Gateway

```
┌─────────────────────────────────────────────────────────────┐
│                    Cliente (Telegram/Web)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Nginx (Reverse Proxy)                           │
│         Rate Limiting, SSL Termination, CORS                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              API Gateway (Go :8080)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Middleware Chain                                    │   │
│  │  1. Logging (request/response)                      │   │
│  │  2. Recovery (panic handler)                        │   │
│  │  3. CORS (cross-origin)                             │   │
│  │  4. Rate Limiting (per IP)                          │   │
│  │  5. Authentication (optional)                       │   │
│  │  6. Request Validation                              │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Routing                                             │   │
│  │  POST /book-appointment → bookingHandler            │   │
│  │  POST /cancel-booking → cancelHandler               │   │
│  │  GET  /availability → availabilityHandler           │   │
│  │  GET  /health → healthHandler                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Handlers (validan request, llaman servicios)       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Windmill Backend                                │
│         (Scripts y Flows de automatización)                 │
└─────────────────────────────────────────────────────────────┘
```

## Routing

### Opción 1: Standard Library (http.ServeMux)

```go
package main

import (
    "net/http"
)

func main() {
    mux := http.NewServeMux()
    
    // Routes básicas
    mux.HandleFunc("GET /health", healthHandler)
    mux.HandleFunc("GET /providers", providersHandler)
    mux.HandleFunc("GET /services", servicesHandler)
    mux.HandleFunc("POST /book-appointment", bookingHandler)
    mux.HandleFunc("POST /cancel-booking", cancelHandler)
    mux.HandleFunc("POST /reschedule-booking", rescheduleHandler)
    
    // Wildcard para 404
    mux.HandleFunc("/", notFoundHandler)
    
    server := &http.Server{
        Addr:    ":8080",
        Handler: mux,
    }
    
    server.ListenAndServe()
}
```

### Opción 2: Chi Router (Recomendado)

```go
import (
    "net/http"
    
    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
)

func NewRouter() *chi.Mux {
    r := chi.NewRouter()
    
    // Middleware global
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    
    // Routes
    r.Get("/health", healthHandler)
    r.Get("/readyz", readinessHandler)
    
    // API v1 routes
    r.Route("/api/v1", func(r chi.Router) {
        // Public routes
        r.Get("/providers", providersHandler)
        r.Get("/services", servicesHandler)
        r.Get("/availability", availabilityHandler)
        
        // Protected routes (requieren auth)
        r.Group(func(r chi.Router) {
            r.Use(authMiddleware)
            r.Post("/book-appointment", bookingHandler)
            r.Post("/cancel-booking", cancelHandler)
            r.Post("/reschedule-booking", rescheduleHandler)
        })
    })
    
    return r
}
```

### Opción 3: Gorilla Mux

```go
import (
    "github.com/gorilla/mux"
)

func NewRouter() *mux.Router {
    r := mux.NewRouter()
    
    // Routes con variables
    r.HandleFunc("/api/v1/providers/{id}", getProviderHandler).Methods("GET")
    r.HandleFunc("/api/v1/providers/{id}/services", getServicesHandler).Methods("GET")
    
    // Subrouter con prefix
    api := r.PathPrefix("/api/v1").Subrouter()
    api.HandleFunc("/bookings", createBookingHandler).Methods("POST")
    api.HandleFunc("/bookings/{id}", getBookingHandler).Methods("GET")
    
    return r
}
```

## Middlewares

### Logging Middleware

```go
// responseWriter wrapper para capturar status code
type responseWriter struct {
    http.ResponseWriter
    statusCode int
    size       int
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
    return &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (rw *responseWriter) WriteHeader(code int) {
    rw.statusCode = code
    rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
    size, err := rw.ResponseWriter.Write(b)
    rw.size += size
    return size, err
}

// Logging middleware
func loggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        
        // Wrap response writer
        rw := newResponseWriter(w)
        
        // Call next handler
        next.ServeHTTP(rw, r)
        
        // Log after request
        log.Printf(
            "[HTTP] %s %s %d %d %v",
            r.Method,
            r.URL.Path,
            rw.statusCode,
            rw.size,
            time.Since(start),
        )
    })
}
```

### Panic Recovery Middleware

```go
func recoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                // Log panic
                log.Printf("[PANIC] %v\n%s", err, debug.Stack())
                
                // Return 500
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusInternalServerError)
                json.NewEncoder(w).Encode(map[string]any{
                    "success": false,
                    "error":   "internal_server_error",
                    "message": "An unexpected error occurred",
                })
            }
        }()
        
        next.ServeHTTP(w, r)
    })
}
```

### CORS Middleware

```go
func corsMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            origin := r.Header.Get("Origin")
            
            // Check if origin is allowed
            allowed := false
            for _, o := range allowedOrigins {
                if o == "*" || o == origin {
                    allowed = true
                    break
                }
            }
            
            if allowed {
                w.Header().Set("Access-Control-Allow-Origin", origin)
                w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
                w.Header().Set("Access-Control-Allow-Credentials", "true")
            }
            
            // Handle preflight
            if r.Method == "OPTIONS" {
                w.WriteHeader(http.StatusNoContent)
                return
            }
            
            next.ServeHTTP(w, r)
        })
    }
}
```

### Rate Limiting Middleware

```go
import "golang.org/x/time/rate"

type visitor struct {
    limiter  *rate.Limiter
    lastSeen time.Time
}

type rateLimiter struct {
    visitors map[string]*visitor
    rate     rate.Limit
    burst    int
    mu       sync.Mutex
}

func newRateLimiter(rate rate.Limit, burst int) *rateLimiter {
    return &rateLimiter{
        visitors: make(map[string]*visitor),
        rate:     rate,
        burst:    burst,
    }
}

func (rl *rateLimiter) getLimiter(ip string) *rate.Limiter {
    rl.mu.Lock()
    defer rl.mu.Unlock()
    
    v, exists := rl.visitors[ip]
    if !exists {
        limiter := rate.NewLimiter(rl.rate, rl.burst)
        v = &visitor{limiter: limiter, lastSeen: time.Now()}
        rl.visitors[ip] = v
    } else {
        v.lastSeen = time.Now()
    }
    
    // Cleanup old visitors (every 3 minutes)
    go rl.cleanup()
    
    return v.limiter
}

func (rl *rateLimiter) cleanup() {
    rl.mu.Lock()
    defer rl.mu.Unlock()
    
    for ip, v := range rl.visitors {
        if time.Since(v.lastSeen) > 3*time.Minute {
            delete(rl.visitors, ip)
        }
    }
}

func (rl *rateLimiter) middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ip := r.RemoteAddr
        
        limiter := rl.getLimiter(ip)
        if !limiter.Allow() {
            w.Header().Set("Content-Type", "application/json")
            w.WriteHeader(http.StatusTooManyRequests)
            json.NewEncoder(w).Encode(map[string]any{
                "success": false,
                "error":   "rate_limit_exceeded",
                "message": "Too many requests, please try again later",
            })
            return
        }
        
        next.ServeHTTP(w, r)
    })
}

// Uso: 10 requests per second, burst of 20
limiter := newRateLimiter(10, 20)
router.Use(limiter.middleware)
```

### Request Validation Middleware

```go
import "github.com/go-playground/validator/v10"

var validate = validator.New()

// Request struct con tags de validación
type BookAppointmentRequest struct {
    ProviderID int    `json:"provider_id" validate:"required,min=1"`
    ServiceID  int    `json:"service_id" validate:"required,min=1"`
    StartTime  string `json:"start_time" validate:"required,datetime=2006-01-02T15:04:05Z07:00"`
    ChatID     string `json:"chat_id" validate:"required"`
    UserName   string `json:"user_name" validate:"required,min=2,max=100"`
    UserEmail  string `json:"user_email" validate:"required,email"`
}

// Validation middleware
func validationMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        var req BookAppointmentRequest
        
        // Decode JSON
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            writeJSONError(w, http.StatusBadRequest, "invalid_json", "Failed to parse request body")
            return
        }
        
        // Validate
        if err := validate.Struct(&req); err != nil {
            errors := formatValidationErrors(err)
            writeJSONError(w, http.StatusBadRequest, "validation_error", "Validation failed", errors)
            return
        }
        
        // Add validated request to context
        ctx := context.WithValue(r.Context(), "request", &req)
        next(w, r.WithContext(ctx))
    }
}

func formatValidationErrors(err error) map[string]string {
    errors := make(map[string]string)
    
    if validationErrors, ok := err.(validator.ValidationErrors); ok {
        for _, e := range validationErrors {
            field := e.Field()
            tag := e.Tag()
            
            var message string
            switch tag {
            case "required":
                message = fmt.Sprintf("%s is required", field)
            case "email":
                message = fmt.Sprintf("%s must be a valid email", field)
            case "min":
                message = fmt.Sprintf("%s must be at least %s", field, e.Param())
            case "max":
                message = fmt.Sprintf("%s must be at most %s", field, e.Param())
            case "datetime":
                message = fmt.Sprintf("%s must be a valid datetime", field)
            default:
                message = fmt.Sprintf("%s validation failed", field)
            }
            
            errors[field] = message
        }
    }
    
    return errors
}
```

## Timeouts del Servidor

### Configuración Recomendada

```go
server := &http.Server{
    Addr:         ":8080",
    Handler:      router,
    
    // Timeouts críticos para producción
    ReadTimeout:      15 * time.Second,  // Máximo tiempo para leer request completo
    WriteTimeout:     15 * time.Second,  // Máximo tiempo para escribir response
    ReadHeaderTimeout: 5 * time.Second,  // Máximo tiempo para leer headers (slowloris protection)
    IdleTimeout:      60 * time.Second,  // Máximo tiempo para keep-alive connections
    
    // Max header size (1MB)
    MaxHeaderBytes: 1 << 20,
}
```

### Timeout por Handler

```go
func withTimeout(handler http.HandlerFunc, timeout time.Duration) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), timeout)
        defer cancel()
        
        r = r.WithContext(ctx)
        
        done := make(chan struct{})
        go func() {
            handler(w, r)
            close(done)
        }()
        
        select {
        case <-done:
            return
        case <-ctx.Done():
            w.Header().Set("Content-Type", "application/json")
            w.WriteHeader(http.StatusGatewayTimeout)
            json.NewEncoder(w).Encode(map[string]any{
                "success": false,
                "error":   "request_timeout",
                "message": "Request took too long to process",
            })
        }
    }
}

// Uso
router.HandleFunc("/book-appointment", withTimeout(bookingHandler, 30*time.Second))
```

## Graceful Shutdown

### Implementación Completa

```go
package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"
)

func main() {
    // Create server
    server := &http.Server{
        Addr:         ":8080",
        Handler:      newRouter(),
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }
    
    // Channel to listen for shutdown signals
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
    
    // Start server in goroutine
    go func() {
        log.Printf("[HTTP] Starting server on %s", server.Addr)
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("[HTTP] Server failed: %v", err)
        }
    }()
    
    // Wait for shutdown signal
    <-stop
    log.Println("[HTTP] Shutdown signal received")
    
    // Create context with timeout for graceful shutdown
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    
    // Attempt graceful shutdown
    if err := server.Shutdown(ctx); err != nil {
        log.Fatalf("[HTTP] Server forced to shutdown: %v", err)
    }
    
    log.Println("[HTTP] Server stopped gracefully")
}
```

### Cleanup de Recursos

```go
func main() {
    // Initialize resources
    db := initDatabase()
    redisClient := initRedis()
    
    server := &http.Server{
        Addr:    ":8080",
        Handler: newRouter(db, redisClient),
    }
    
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
    
    go func() {
        server.ListenAndServe()
    }()
    
    <-stop
    
    // Graceful shutdown with cleanup
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    
    // 1. Stop accepting new requests
    log.Println("[HTTP] Stopping HTTP server...")
    if err := server.Shutdown(ctx); err != nil {
        log.Printf("[HTTP] Shutdown error: %v", err)
    }
    
    // 2. Close database connections
    log.Println("[DB] Closing database connections...")
    if err := db.Close(); err != nil {
        log.Printf("[DB] Close error: %v", err)
    }
    
    // 3. Close Redis connections
    log.Println("[Redis] Closing Redis connections...")
    if err := redisClient.Close(); err != nil {
        log.Printf("[Redis] Close error: %v", err)
    }
    
    log.Println("[HTTP] Graceful shutdown complete")
}
```

## Health Checks

### Liveness Probe (¿Está vivo?)

```go
func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]any{
        "status":    "healthy",
        "timestamp": time.Now().UTC().Format(time.RFC3339),
        "version":   "1.0.0",
    })
}
```

### Readiness Probe (¿Listo para tráfico?)

```go
type ReadinessResponse struct {
    Status     string            `json:"status"`
    Timestamp  string            `json:"timestamp"`
    Checks     map[string]string `json:"checks"`
    Degraded   []string          `json:"degraded,omitempty"`
}

func readinessHandler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()
    
    response := ReadinessResponse{
        Status:    "healthy",
        Timestamp: time.Now().UTC().Format(time.RFC3339),
        Checks:    make(map[string]string),
    }
    
    // Check database
    if err := db.PingContext(ctx); err != nil {
        response.Checks["database"] = "unhealthy"
        response.Degraded = append(response.Degraded, "database")
        response.Status = "unhealthy"
    } else {
        response.Checks["database"] = "healthy"
    }
    
    // Check Redis
    if err := redisClient.Ping(ctx).Err(); err != nil {
        response.Checks["redis"] = "unhealthy"
        response.Degraded = append(response.Degraded, "redis")
        response.Status = "unhealthy"
    } else {
        response.Checks["redis"] = "healthy"
    }
    
    // Check Windmill API
    if err := checkWindmillAPI(ctx); err != nil {
        response.Checks["windmill"] = "unhealthy"
        response.Degraded = append(response.Degraded, "windmill")
        response.Status = "degraded" // No bloquear, es dependencia externa
    } else {
        response.Checks["windmill"] = "healthy"
    }
    
    // Set status code
    statusCode := http.StatusOK
    if response.Status == "unhealthy" {
        statusCode = http.StatusServiceUnavailable
    }
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(statusCode)
    json.NewEncoder(w).Encode(response)
}
```

### Kubernetes Probes Configuration

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: booking-titanium-api
spec:
  template:
    spec:
      containers:
      - name: api
        image: booking-titanium-api:latest
        ports:
        - containerPort: 8080
        
        # Startup probe (permite hasta 5 minutos para iniciar)
        startupProbe:
          httpGet:
            path: /startupz
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 30
        
        # Liveness probe (reinicia si falla)
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 0
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        
        # Readiness probe (remueve del load balancer si falla)
        readinessProbe:
          httpGet:
            path: /readyz
            port: 8080
          initialDelaySeconds: 0
          periodSeconds: 5
          timeoutSeconds: 5
          failureThreshold: 3
          successThreshold: 1
        
        terminationGracePeriodSeconds: 60
```

## Validación de Request/Response

### Request Struct con Validación

```go
type BookAppointmentRequest struct {
    ProviderID int    `json:"provider_id" validate:"required,min=1"`
    ServiceID  int    `json:"service_id" validate:"required,min=1"`
    StartTime  string `json:"start_time" validate:"required,datetime=2006-01-02T15:04:05Z07:00"`
    ChatID     string `json:"chat_id" validate:"required"`
    UserName   string `json:"user_name" validate:"required,min=2,max=100"`
    UserEmail  string `json:"user_email" validate:"required,email"`
}

func (r *BookAppointmentRequest) ToBookingData() BookingData {
    return BookingData{
        ProviderID: r.ProviderID,
        ServiceID:  r.ServiceID,
        StartTime:  parseTime(r.StartTime),
        ChatID:     r.ChatID,
        UserName:   r.UserName,
        UserEmail:  r.UserEmail,
    }
}
```

### Response Estándar

```go
type APIResponse struct {
    Success      bool              `json:"success"`
    ErrorCode    *string           `json:"error_code,omitempty"`
    ErrorMessage *string           `json:"error_message,omitempty"`
    Data         any               `json:"data,omitempty"`
    Meta         ResponseMetadata  `json:"_meta"`
}

type ResponseMetadata struct {
    Source      string            `json:"source"`
    Timestamp   string            `json:"timestamp"`
    WorkflowID  string            `json:"workflow_id,omitempty"`
    RequestID   string            `json:"request_id,omitempty"`
    LatencyMs   int64             `json:"latency_ms,omitempty"`
}

// Helper functions
func writeJSONSuccess(w http.ResponseWriter, data any, source string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(APIResponse{
        Success: true,
        Data:    data,
        Meta: ResponseMetadata{
            Source:    source,
            Timestamp: time.Now().UTC().Format(time.RFC3339),
        },
    })
}

func writeJSONError(w http.ResponseWriter, statusCode int, errorCode, message string, details map[string]string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(statusCode)
    
    response := APIResponse{
        Success:      false,
        ErrorCode:    &errorCode,
        ErrorMessage: &message,
        Meta: ResponseMetadata{
            Source:    "API_Gateway",
            Timestamp: time.Now().UTC().Format(time.RFC3339),
        },
    }
    
    if details != nil {
        response.Data = details
    }
    
    json.NewEncoder(w).Encode(response)
}
```

## Documentación de Endpoints (OpenAPI/Swagger)

### Annotations con Swaggo

```go
// @title          Booking Titanium API
// @version        1.0.0
// @description    API Gateway for Booking Titanium system
// @host           windmill.stax.ink
// @BasePath       /api/v1
// @schemes        https

// BookAppointment godoc
// @Summary        Create a new booking
// @Description    Create a new appointment booking
// @Tags           bookings
// @Accept         json
// @Produce        json
// @Param          request body BookAppointmentRequest true "Booking details"
// @Success        200  {object}  APIResponse
// @Failure        400  {object}  APIResponse
// @Failure        500  {object}  APIResponse
// @Router         /book-appointment [post]
func bookingHandler(w http.ResponseWriter, r *http.Request) {
    // ... handler implementation
}

// GetProviders godoc
// @Summary        List all providers
// @Description    Get list of all available providers
// @Tags           providers
// @Accept         json
// @Produce        json
// @Success        200  {object}  APIResponse
// @Router         /providers [get]
func providersHandler(w http.ResponseWriter, r *http.Request) {
    // ... handler implementation
}
```

### Generar Documentación

```bash
# Instalar swaggo
go install github.com/swaggo/swag/cmd/swag@latest

# Generar docs
swag init -g cmd/api/main.go -o docs/swagger

# Los archivos se generan en:
# - docs/swagger/docs.go
# - docs/swagger/swagger.json
# - docs/swagger/swagger.yaml

# Servir Swagger UI
import "github.com/swaggo/http-swagger"

router.HandleFunc("/swagger/", httpSwagger.WrapHandler)
```

## Errores Comunes

### ❌ No Configurar Timeouts

```go
// MAL: Sin timeouts, vulnerable a slow client attacks
server := &http.Server{
    Addr:    ":8080",
    Handler: mux,
}

// BIEN: Con timeouts configurados
server := &http.Server{
    Addr:              ":8080",
    Handler:           mux,
    ReadTimeout:       15 * time.Second,
    WriteTimeout:      15 * time.Second,
    ReadHeaderTimeout: 5 * time.Second,
    IdleTimeout:       60 * time.Second,
}
```

### ❌ No Graceful Shutdown

```go
// MAL: Matar el servidor abruptamente
log.Fatal(server.ListenAndServe())

// BIEN: Graceful shutdown con signal handling
stop := make(chan os.Signal, 1)
signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
<-stop
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()
server.Shutdown(ctx)
```

### ❌ Middleware en Orden Incorrecto

```go
// MAL: Auth antes que CORS (preflight falla)
r.Use(authMiddleware)
r.Use(corsMiddleware)

// BIEN: Logging → Recovery → CORS → Auth → Handlers
r.Use(loggingMiddleware)
r.Use(recoveryMiddleware)
r.Use(corsMiddleware)
r.Use(rateLimitMiddleware)
r.Use(authMiddleware)  // Solo para rutas protegidas
```

### ❌ No Validar Requests

```go
// MAL: Asumir que el JSON es válido
var req BookAppointmentRequest
json.NewDecoder(r.Body).Decode(&req)
// Usar req sin validar...

// BIEN: Validar después de decode
var req BookAppointmentRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
    writeJSONError(w, http.StatusBadRequest, "invalid_json", "")
    return
}
if err := validate.Struct(&req); err != nil {
    writeJSONError(w, http.StatusBadRequest, "validation_error", formatErrors(err))
    return
}
```

### ❌ Health Check con Dependencias Externas

```go
// MAL: Liveness depende de DB externa
func healthHandler(w http.ResponseWriter, r *http.Request) {
    if err := db.Ping(); err != nil {
        w.WriteHeader(500)  // Kubernetes reinicia el pod innecesariamente
        return
    }
}

// BIEN: Liveness simple, Readiness con dependencias
func livenessHandler(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(200)  // Solo indica que el proceso está vivo
}

func readinessHandler(w http.ResponseWriter, r *http.Request) {
    if err := db.Ping(); err != nil {
        w.WriteHeader(503)  // Remueve del load balancer, no reinicia
        return
    }
}
```

## Checklist Producción

- [ ] Router configurado (chi/gorilla/mux o stdlib)
- [ ] Middleware chain: logging, recovery, CORS, rate limiting, auth
- [ ] Timeouts configurados (Read, Write, Idle, ReadHeader)
- [ ] Graceful shutdown con signal handling
- [ ] Health checks: /health (liveness), /readyz (readiness)
- [ ] Request validation con struct tags
- [ ] Response estándar (success, error_code, data, _meta)
- [ ] OpenAPI/Swagger documentation generada
- [ ] Error handling consistente (HTTP status codes correctos)
- [ ] Request ID tracking (X-Request-ID header)
- [ ] Logging estructurado de requests/responses
- [ ] Rate limiting configurado (10 req/s por IP)
