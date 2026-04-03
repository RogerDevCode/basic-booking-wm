# Docker Multi-Stage Build para Aplicación TypeScript/Bun - Best Practices

## Arquitectura de Imagen Multi-Stage

```
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: Builder (oven/bun:alpine)                         │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  - Bun runtime completo                                 │ │
│  │  - Dependencias de desarrollo                           │ │
│  │  - bun install --frozen-lockfile                        │ │
│  │  - bun build --compile (binary) o bun run build         │ │
│  │  - Resultado: bundle optimizado ~5-15MB               │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                               │
                               │ COPY --from=builder
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 2: Runner (alpine mínimo + bun)                      │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  - Solo código compilado/bundle                         │ │
│  │  - Bun runtime (si no se compiló a binario)             │ │
│  │  - ca-certificates (HTTPS)                              │ │
│  │  - tzdata (timezones)                                   │ │
│  │  - Usuario non-root (appuser)                           │ │
│  │  - HEALTHCHECK configurado                              │ │
│  │  - Resultado: imagen final ~40-80MB                   │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Dockerfile Multi-Stage Completo

### Opción A: Bun Compile (Binario Estático)

```dockerfile
# ==============================================================================
# Stage 1: Builder
# ==============================================================================
FROM oven/bun:1-alpine AS builder

# Build-time arguments
ARG APP_VERSION=1.0.0
ARG BUILD_DATE
ARG GIT_COMMIT

# Working directory
WORKDIR /src

# Instalar dependencias del sistema para builds nativos
RUN apk add --no-cache git ca-certificates tzdata

# Copiar package files (cache layer)
COPY package.json bun.lock* ./

# Instalar dependencias
RUN bun install --frozen-lockfile --production=false

# Copiar código fuente
COPY . .

# Compilar a binario estático
RUN bun build ./src/main.ts \
    --compile \
    --outfile /app/booking-server \
    --define process.env.APP_VERSION=\"${APP_VERSION}\" \
    --define process.env.BUILD_DATE=\"${BUILD_DATE}\" \
    --define process.env.GIT_COMMIT=\"${GIT_COMMIT}\"

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

# Copiar binario del builder
COPY --from=builder /app/booking-server /app/booking-server

# Crear directorios para logs y datos temporales
RUN mkdir -p /app/logs /app/data /app/tmp && \
    chown -R ${APP_USER}:${APP_GROUP} /app && \
    chmod -R 755 /app

# Cambiar a usuario non-root
USER ${APP_USER}

# Exponer puerto
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Variables de entorno por defecto
ENV PORT=3000
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Entry point
ENTRYPOINT ["/app/booking-server"]
```

### Opción B: Bun Runtime (Sin Compilación)

```dockerfile
# ==============================================================================
# Stage 1: Builder
# ==============================================================================
FROM oven/bun:1-alpine AS builder

WORKDIR /src

# Copiar package files (cache layer)
COPY package.json bun.lock* ./

# Instalar dependencias
RUN bun install --frozen-lockfile --production=false

# Copiar código fuente
COPY . .

# Build TypeScript (si aplica)
RUN bun run build

# ==============================================================================
# Stage 2: Runner
# ==============================================================================
FROM oven/bun:1-alpine AS runner

ARG APP_USER=appuser
ARG APP_GROUP=appgroup
ARG APP_UID=1000
ARG APP_GID=1000

RUN apk add --no-cache ca-certificates tzdata

RUN addgroup -S -g ${APP_GID} ${APP_GROUP} && \
    adduser -S -G ${APP_GROUP} -u ${APP_UID} ${APP_USER}

WORKDIR /app

# Copiar solo producción dependencies
COPY --from=builder /src/package.json /src/bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copiar código compilado
COPY --from=builder /src/dist ./dist

RUN mkdir -p /app/logs /app/data /app/tmp && \
    chown -R ${APP_USER}:${APP_GROUP} /app && \
    chmod -R 755 /app

USER ${APP_USER}

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENV PORT=3000
ENV NODE_ENV=production
ENV LOG_LEVEL=info

CMD ["bun", "run", "dist/main.js"]
```

## Optimizaciones de Build

### .dockerignore

```
node_modules
.git
.gitignore
*.md
.env
.env.*
!.env.example
dist
coverage
.nyc_output
*.log
docker-compose*
docs/
tests/
```

### Comparación de Tamaños

| Configuración | Tamaño |
|---------------|--------|
| Sin optimizar (full bun + src) | ~200MB |
| Multi-stage (bun runtime + prod deps) | ~80MB |
| Bun compile (binario estático) | ~40MB |
| Multi-stage + UPX compressed | ~30MB |

### Multi-Platform Build

```dockerfile
# ARG para plataforma (automático con buildx)
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Bun soporta multi-platform nativamente
RUN bun build ./src/main.ts \
    --compile \
    --outfile /app/booking-server
```

**Build multi-arch:**
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t booking-server:latest \
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
COPY --chown=appuser:appgroup config.json /app/config.json
RUN chmod 644 /app/config.json
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
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
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
HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1

# Con wget (incluido en alpine)
HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Con script custom
HEALTHCHECK CMD /app/healthcheck.sh || exit 1
```

### Healthcheck en docker-compose

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
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
ENV PORT=3000
ENV LOG_LEVEL=info

# Bun accede via process.env o Bun.env
# const port = process.env.PORT;
```

### Mejores Prácticas

```dockerfile
# ✅ BIEN: Defaults en Dockerfile
ENV PORT=3000
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
PORT=3000
LOG_LEVEL=info
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=gsk_***REDACTED***
OPENAI_API_KEY=sk-xxx
TELEGRAM_BOT_TOKEN=xxx

# .env (no commitear, agregar a .gitignore)
DATABASE_URL=postgresql://booking:booking123@postgres:5432/bookings
# ... valores reales
```

## Docker Compose Producción

```yaml
version: '3.8'

services:
  # ============================================================================
  # API Server (Bun)
  # ============================================================================
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner
      args:
        APP_VERSION: "1.0.0"
        BUILD_DATE: "${BUILD_DATE}"
        GIT_COMMIT: "${GIT_COMMIT}"
    container_name: booking-prod-api
    restart: unless-stopped
    expose:
      - "3000"
    environment:
      - PORT=${PORT}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - LOG_LEVEL=${LOG_LEVEL}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - GROQ_API_KEY=${GROQ_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - booking-network
    volumes:
      - ./logs/api:/app/logs
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # ============================================================================
  # PostgreSQL Database
  # ============================================================================
  postgres:
    image: postgres:17-alpine
    container_name: booking-prod-db
    restart: unless-stopped
    expose:
      - "5432"
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d:ro
    networks:
      - booking-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

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

networks:
  booking-network:
    driver: bridge

volumes:
  postgres_data:
    driver: local
```

## Errores Comunes

### ❌ Single-Stage Build

```dockerfile
# MAL: Imagen gigante (~200MB)
FROM oven/bun:1
COPY . .
RUN bun install
CMD ["bun", "run", "src/main.ts"]

# BIEN: Multi-stage (~40-80MB)
FROM oven/bun:1-alpine AS builder
# ... build
FROM oven/bun:1-alpine AS runner
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
    CMD wget http://localhost:3000/health

# BIEN: Con start-period para startup lento
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget http://localhost:3000/health
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

### ❌ No Usar .dockerignore

```
# Sin .dockerignore: node_modules, .git, docs, tests se copian a la imagen

# BIEN: .dockerignore
node_modules
.git
*.md
.env
docs/
tests/
```

## Checklist Producción

- [ ] Multi-stage build (builder + runner)
- [ ] Builder: oven/bun:alpine con bun install --frozen-lockfile
- [ ] Runner: alpine mínimo con solo bundle/binario
- [ ] Usuario non-root (adduser/addgroup)
- [ ] HEALTHCHECK configurado (interval, timeout, start-period, retries)
- [ ] ARG para build-time, ENV para runtime
- [ ] Secrets inyectados via docker-compose (no en Dockerfile)
- [ ] depends_on con condition: service_healthy
- [ ] Networks configurados (bridge)
- [ ] Volumes para datos persistentes
- [ ] Restart policy: unless-stopped
- [ ] Logs en volumes montados
- [ ] .env.example con valores de ejemplo
- [ ] .gitignore para .env y secrets
- [ ] .dockerignore para excluir archivos innecesarios
