# Docker Multi-Stage Build para Aplicación Go - Best Practices

## Arquitectura de Imagen Multi-Stage

```
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: Builder (golang:alpine)                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  - Go toolchain completo                               │ │
│  │  - Dependencias de build                               │ │
│  │  - CGO_ENABLED=0 (static binary)                       │ │
│  │  - go build -ldflags='-w -s' (optimizar)              │ │
│  │  - Resultado: binario estático ~10-20MB               │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ COPY --from=builder
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 2: Runner (alpine mínimo)                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  - Solo binario compilado                              │ │
│  │  - ca-certificates (HTTPS)                             │ │
│  │  - tzdata (timezones)                                  │ │
│  │  - Usuario non-root (appuser)                          │ │
│  │  - HEALTHCHECK configurado                             │ │
│  │  - Resultado: imagen final ~15-25MB                   │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Dockerfile Multi-Stage Completo

```dockerfile
# ==============================================================================
# Stage 1: Builder
# ==============================================================================
FROM golang:1.25-alpine AS builder

# Build-time arguments (no persisten en imagen final)
ARG APP_VERSION=1.0.0
ARG BUILD_DATE
ARG GIT_COMMIT

# Environment variables para el build
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64

# Instalar dependencias de build
RUN apk add --no-cache git ca-certificates tzdata

# Working directory
WORKDIR /src

# Download dependencies (cache layer)
COPY go.mod go.sum ./
RUN go mod download

# Copiar código fuente
COPY . .

# Compilar con optimizaciones
RUN set -eux && \
    go build \
    -ldflags='-w -s -extldflags "-static" \
      -X main.Version=${APP_VERSION} \
      -X main.BuildDate=${BUILD_DATE} \
      -X main.GitCommit=${GIT_COMMIT}' \
    -a \
    -installsuffix cgo \
    -o /app/booking-api ./cmd/api && \
    go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a \
    -installsuffix cgo \
    -o /app/booking-workers ./cmd/workers

# ==============================================================================
# Stage 2: Runner
# ==============================================================================
FROM alpine:3.19 AS runner

# Runtime arguments
ARG APP_USER=appuser
ARG APP_GROUP=appgroup
ARG APP_UID=1000
ARG APP_GID=1000

# Instalar dependencias mínimas de runtime
RUN apk add --no-cache ca-certificates tzdata

# Crear usuario y grupo non-root
RUN addgroup -S -g ${APP_GID} ${APP_GROUP} && \
    adduser -S -G ${APP_GROUP} -u ${APP_UID} ${APP_USER}

# Working directory
WORKDIR /app

# Copiar binarios del builder
COPY --from=builder /app/booking-api /app/booking-api
COPY --from=builder /app/booking-workers /app/booking-workers

# Copiar archivos de configuración (si existen)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Crear directorios para logs y datos temporales
RUN mkdir -p /app/logs /app/data /app/tmp && \
    chown -R ${APP_USER}:${APP_GROUP} /app && \
    chmod -R 755 /app

# Cambiar a usuario non-root
USER ${APP_USER}

# Exponer puerto
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Variables de entorno por defecto
ENV SERVER_PORT=8080
ENV SERVER_HOST=0.0.0.0
ENV LOG_LEVEL=info
ENV LOG_FORMAT=json

# Entry point
ENTRYPOINT ["/app/booking-api"]
```

## Optimizaciones de Build

### Build Flags para Tamaño Mínimo

```dockerfile
# -w: Omitir tabla de símbolos DWARF
# -s: Omitir tabla de símbolos Go
# -extldflags "-static": Link estático
RUN go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a \
    -installsuffix cgo \
    -o /app/api ./cmd/api
```

### Comparación de Tamaños

| Configuración | Tamaño |
|---------------|--------|
| Sin optimizar | ~50MB |
| -w -s | ~15MB |
| -w -s -static | ~12MB |
| UPX compressed | ~8MB |

### Multi-Platform Build

```dockerfile
# ARG para plataforma
ARG TARGETOS
ARG TARGETARCH

ENV GOOS=${TARGETOS}
ENV GOARCH=${TARGETARCH}

RUN go build \
    -ldflags='-w -s' \
    -o /app/api ./cmd/api
```

**Build multi-arch:**
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t booking-api:latest \
  --push \
  .
```

## Usuario Non-Root (Seguridad)

### Crear Usuario en Dockerfile

```dockerfile
# Alpine
RUN addgroup -S -g 1000 appgroup && \
    adduser -S -G appgroup -u 1000 appuser

# Debian/Ubuntu
RUN groupadd -r -g 1000 appgroup && \
    useradd -r -u 1000 -g appgroup appuser

# Cambiar ownership
RUN chown -R appuser:appgroup /app

# Cambiar a usuario non-root
USER appuser
```

### Beneficios de Seguridad

| Riesgo | Root Container | Non-Root Container |
|--------|----------------|-------------------|
| Container escape | Root en host | Usuario limitado |
| Modificación de sistema | ✅ Posible | ❌ Bloqueado |
| Instalación de herramientas | ✅ Posible | ❌ Bloqueado |
| Acceso a archivos host | ✅ Root | ❌ Limitado |

### Permisos de Archivos

```dockerfile
# Directorios con write access
RUN mkdir -p /app/logs /app/data /app/tmp && \
    chown -R appuser:appgroup /app && \
    chmod 755 /app

# Archivos de configuración (solo lectura)
COPY --chown=appuser:appgroup config.yaml /app/config.yaml
RUN chmod 644 /app/config.yaml
```

### Volúmenes con Non-Root

```yaml
# docker-compose.yml
services:
  api:
    user: "1000:1000"  # UID:GID
    volumes:
      - ./logs:/app/logs  # Asegurar ownership en host
      - ./config:/app/config:ro  # Solo lectura
```

**En host:**
```bash
# Crear directorios con ownership correcto
mkdir -p logs config
chown 1000:1000 logs
chown 1000:1000 config
```

## Healthcheck Configuration

### HEALTHCHECK en Dockerfile

```dockerfile
HEALTHCHECK \
    --interval=30s \
    --timeout=10s \
    --start-period=40s \
    --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
```

### Parámetros Explicados

| Parámetro | Valor | Propósito |
|-----------|-------|-----------|
| `--interval` | 30s | Tiempo entre checks |
| `--timeout` | 10s | Timeout máximo del check |
| `--start-period` | 40s | Período de gracia al inicio |
| `--retries` | 3 | Fallos para marcar unhealthy |

### Healthcheck con curl

```dockerfile
# Con curl (requiere instalar curl)
HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1

# Con wget (incluido en alpine)
HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Con script custom
HEALTHCHECK CMD /app/healthcheck.sh || exit 1
```

### Healthcheck en docker-compose

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Variables de Entorno

### ARG vs ENV

```dockerfile
# ARG: Solo build-time (no persiste)
ARG APP_VERSION=1.0.0
ARG BUILD_DATE
ARG GIT_COMMIT

# Usar ARG en build
RUN echo "Building version ${APP_VERSION}"

# ENV: Runtime (persiste en imagen)
ENV APP_VERSION=${APP_VERSION}
ENV SERVER_PORT=8080
ENV LOG_LEVEL=info

# Go accede via os.Getenv()
# val := os.Getenv("SERVER_PORT")
```

### Mejores Prácticas

```dockerfile
# ✅ BIEN: Defaults en Dockerfile
ENV SERVER_PORT=8080
ENV DATABASE_URL=postgresql://localhost:5432/bookings
ENV LOG_LEVEL=info

# ✅ BIEN: Secrets inyectados en runtime (docker-compose)
# services:
#   api:
#     environment:
#       - DATABASE_URL=${DATABASE_URL}  # De .env
#       - API_KEY=${API_KEY}  # De .env

# ❌ MAL: Secrets en Dockerfile
ENV API_KEY=supersecret123  # ¡Expuesto en imagen!
```

### .env.example

```bash
# .env.example (commitear este)
DATABASE_URL=postgresql://user:password@localhost:5432/bookings
SERVER_PORT=8080
LOG_LEVEL=info
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=gsk_xxx
OPENAI_API_KEY=sk-xxx
TELEGRAM_BOT_TOKEN=xxx

# .env (no commitear, agregar a .gitignore)
DATABASE_URL=postgresql://booking:booking123@postgres:5432/bookings
# ... valores reales
```

## Docker Compose Producción (8 Servicios)

```yaml
version: '3.8'

# ==============================================================================
# PRODUCTION DOCKER COMPOSE
# ==============================================================================

services:
  # ============================================================================
  # API Server
  # ============================================================================
  api:
    build:
      context: .
      dockerfile: docker-compose/Dockerfile
      target: runner
      args:
        APP_VERSION: "1.0.0"
        BUILD_DATE: "${BUILD_DATE}"
        GIT_COMMIT: "${GIT_COMMIT}"
    container_name: booking-prod-api
    restart: unless-stopped
    expose:
      - "8080"
    environment:
      - SERVER_HOST=${SERVER_HOST}
      - SERVER_PORT=${SERVER_PORT}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - LOG_LEVEL=${LOG_LEVEL}
      - LOG_FORMAT=${LOG_FORMAT}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - GMAIL_USERNAME=${GMAIL_USERNAME}
      - GMAIL_PASSWORD=${GMAIL_PASSWORD}
      - GOOGLE_CREDENTIALS_JSON=${GOOGLE_CREDENTIALS_JSON}
      - GROQ_API_KEY=${GROQ_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - booking-network
    volumes:
      - ./logs/api:/app/logs
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # ============================================================================
  # Background Workers
  # ============================================================================
  workers:
    build:
      context: .
      dockerfile: docker-compose/Dockerfile
      target: runner
    container_name: booking-prod-workers
    restart: unless-stopped
    command: ["/app/booking-workers"]
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - LOG_LEVEL=${LOG_LEVEL}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - GMAIL_USERNAME=${GMAIL_USERNAME}
      - GMAIL_PASSWORD=${GMAIL_PASSWORD}
      - GOOGLE_CREDENTIALS_JSON=${GOOGLE_CREDENTIALS_JSON}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - booking-network
    volumes:
      - ./logs/workers:/app/logs
    healthcheck:
      test: ["CMD", "pgrep", "-f", "booking-workers"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============================================================================
  # PostgreSQL Database
  # ============================================================================
  postgres:
    image: postgres:17-alpine
    container_name: booking-prod-db
    restart: unless-stopped
    expose:
      - "${POSTGRES_PORT}"
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
      - PGDATA=${PGDATA}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d:ro
    networks:
      - booking-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  # ============================================================================
  # PgAdmin (Database Management)
  # ============================================================================
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: booking-prod-pgadmin
    restart: unless-stopped
    ports:
      - "5050:80"
    environment:
      - PGADMIN_DEFAULT_EMAIL=${PGADMIN_EMAIL}
      - PGADMIN_DEFAULT_PASSWORD=${PGADMIN_PASSWORD}
      - PGADMIN_CONFIG_SERVER_MODE=False
      - PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED=False
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    networks:
      - booking-network
    depends_on:
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/misc/ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============================================================================
  # Redis (Cache & Session Storage)
  # ============================================================================
  redis:
    image: redis:7-alpine
    container_name: booking-prod-redis
    restart: unless-stopped
    expose:
      - "${REDIS_PORT}"
    command: redis-server --appendonly yes ${REDIS_PASSWORD:+--requirepass ${REDIS_PASSWORD}}
    volumes:
      - redis_data:/data
    networks:
      - booking-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s

  # ============================================================================
  # Nginx (Reverse Proxy)
  # ============================================================================
  nginx:
    image: nginx:alpine
    container_name: booking-prod-nginx
    restart: unless-stopped
    ports:
      - "${NGINX_HTTP_PORT}:80"
      - "${NGINX_HTTPS_PORT}:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - api
    networks:
      - booking-network
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============================================================================
  # Cloudflared Tunnel (Expose to internet)
  # ============================================================================
  cloudflared:
    container_name: cloudflared-tunnel
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    env_file:
      - .env.cloudflared
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
      - TUNNEL_METRICS=0.0.0.0:20244
    depends_on:
      - api
    networks:
      - booking-network
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "--metrics", "0.0.0.0:20244", "ready"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # ============================================================================
  # Monitoring (Optional - Prometheus/Grafana)
  # ============================================================================
  grafana:
    image: grafana/grafana:latest
    container_name: booking-grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_USER}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    networks:
      - booking-network
    depends_on:
      - api

networks:
  booking-network:
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: "172.20.0.0/16"

volumes:
  postgres_data:
    driver: local
  pgadmin_data:
    driver: local
  redis_data:
    driver: local
  grafana_data:
    driver: local
```

## Errores Comunes

### ❌ Single-Stage Build

```dockerfile
# MAL: Imagen gigante (~500MB)
FROM golang:1.25
COPY . .
RUN go build -o app .
CMD ["./app"]

# BIEN: Multi-stage (~15MB)
FROM golang:1.25-alpine AS builder
# ... build
FROM alpine:3.19
COPY --from=builder /app /app
```

### ❌ Correr como Root

```dockerfile
# MAL: Root user
FROM alpine:3.19
COPY app /app
CMD ["/app"]

# BIEN: Non-root user
FROM alpine:3.19
RUN adduser -S appuser
USER appuser
CMD ["/app"]
```

### ❌ Healthcheck Sin Start-Period

```dockerfile
# MAL: Puede marcar unhealthy durante startup
HEALTHCHECK --interval=30s --retries=3 \
    CMD wget http://localhost:8080/health

# BIEN: Con start-period para startup lento
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget http://localhost:8080/health
```

### ❌ ENV para Secrets

```dockerfile
# MAL: Secret expuesto en imagen
ENV API_KEY=supersecret123

# BIEN: Secret inyectado en runtime
# docker-compose.yml
# services:
#   api:
#     environment:
#       - API_KEY=${API_KEY}
```

### ❌ Sin depends_on con condition

```yaml
# MAL: API puede iniciar antes que DB
services:
  api:
    depends_on:
      - postgres

# BIEN: Esperar hasta que DB esté healthy
services:
  api:
    depends_on:
      postgres:
        condition: service_healthy
```

## Checklist Producción

- [ ] Multi-stage build (builder + runner)
- [ ] Builder: golang:alpine con CGO_ENABLED=0
- [ ] Runner: alpine mínimo con solo binario
- [ ] Build flags: -ldflags='-w -s'
- [ ] Usuario non-root (adduser/addgroup)
- [ ] HEALTHCHECK configurado (interval, timeout, start-period, retries)
- [ ] ARG para build-time, ENV para runtime
- [ ] Secrets inyectados via docker-compose (no en Dockerfile)
- [ ] depends_on con condition: service_healthy
- [ ] Networks configurados (bridge, subnet)
- [ ] Volumes para datos persistentes
- [ ] Restart policy: unless-stopped
- [ ] Logs en volumes montados
- [ ] .env.example con valores de ejemplo
- [ ] .gitignore para .env y secrets
