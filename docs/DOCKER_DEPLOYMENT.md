# 🐳 Docker Deployment Guide - Booking Titanium

**Estado:** ✅ Completado  
**Versión:** 1.0.0

---

## 📋 Descripción

Configuración Docker completa para deployment del sistema Booking Titanium en producción.

---

## 🏗️ Arquitectura Docker

```
┌─────────────────────────────────────────────────────────────┐
│                         Nginx (Port 80/443)                  │
│                    Reverse Proxy + Rate Limiting             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Server (Port 8080)                    │
│                  Go HTTP Server + Booking API                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL (Port 5432)                     │
│                  Primary Database                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Redis (Port 6379)                       │
│                  Cache & Session Storage                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Clonar y configurar
```bash
cd booking-titanium-wm

# Copiar environment template
cp .env.example .env

# Editar .env con tus credenciales
nano .env
```

### 2. Build y start
```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 3. Verificar
```bash
# Health check
curl http://localhost:8080/health

# Check container status
docker-compose ps
```

---

## 📁 Archivos de Configuración

### Dockerfile
**Propósito:** Build del API server y workers en Go

**Stages:**
1. **Builder:** Compila binaries en Go
2. **Final:** Runtime minimal con Alpine

**Características:**
- Multi-stage build para imagen pequeña
- Non-root user por seguridad
- Health check integrado
- CGO disabled para portabilidad

---

### docker-compose.yml
**Servicios:**

| Servicio | Puerto | Propósito |
|----------|--------|-----------|
| `api` | 8080 | API HTTP server |
| `workers` | - | Background workers |
| `postgres` | 5432 | Base de datos |
| `pgadmin` | 5050 | DB management UI |
| `redis` | 6379 | Cache |
| `nginx` | 80/443 | Reverse proxy |

---

### nginx/nginx.conf
**Configuración:**
- Rate limiting (10 req/s)
- Gzip compression
- Security headers
- HTTPS ready (con SSL certs)
- Health check endpoint

---

### database/init/001_init.sql
**Inicialización:**
- Crea todas las tablas
- Inserta seed data
- Configura índices
- Crea views y triggers

---

## 🔧 Comandos Útiles

### Development
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs -f api
docker-compose logs -f workers
docker-compose logs -f postgres

# Rebuild specific service
docker-compose build api
docker-compose up -d api

# Execute command in container
docker-compose exec api /bin/sh
docker-compose exec postgres psql -U booking -d bookings
```

### Production
```bash
# Start in production mode
docker-compose -f docker-compose.yml up -d

# Scale workers
docker-compose up -d --scale workers=3

# Update services
docker-compose pull
docker-compose up -d --force-recreate

# Backup database
docker-compose exec postgres pg_dump -U booking bookings > backup.sql

# Restore database
docker-compose exec -T postgres psql -U booking bookings < backup.sql
```

### Troubleshooting
```bash
# View container status
docker-compose ps

# View resource usage
docker stats

# Inspect container
docker inspect booking-titanium-api

# View logs
docker-compose logs --tail=100 api

# Restart failed container
docker-compose restart api

# Remove all containers and volumes
docker-compose down -v
```

---

## 🔐 Configuración de Seguridad

### Environment Variables Sensibles
```bash
# .env (NO COMMITEAR)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
GMAIL_USERNAME=tu-email@gmail.com
GMAIL_PASSWORD=app-password-here
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
DATABASE_PASSWORD=secure-password-here
```

### SSL/TLS Configuration
```bash
# Generar certificados SSL (producción)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem

# Configurar en nginx/conf.d/ssl.conf
```

### Network Security
```yaml
# docker-compose.yml
networks:
  booking-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

---

## 📊 Monitoreo

### Health Checks
```bash
# API health
curl http://localhost:8080/health

# Database health
docker-compose exec postgres pg_isready

# Redis health
docker-compose exec redis redis-cli ping

# Nginx health
curl http://localhost/health
```

### Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api

# JSON format (for log aggregation)
docker-compose logs --tail=100 api | jq
```

### Metrics
```bash
# Container stats
docker stats

# Database size
docker-compose exec postgres psql -U booking bookings -c \
  "SELECT pg_size_pretty(pg_database_size('bookings'));"

# Redis info
docker-compose exec redis redis-cli info
```

---

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build and push
        run: |
          docker-compose build
          docker-compose push
      
      - name: Deploy
        run: |
          docker-compose pull
          docker-compose up -d
```

### GitLab CI Example
```yaml
stages:
  - build
  - deploy

build:
  stage: build
  script:
    - docker-compose build
    - docker-compose push

deploy:
  stage: deploy
  script:
    - docker-compose pull
    - docker-compose up -d
  only:
    - main
```

---

## 📈 Scaling

### Horizontal Scaling
```bash
# Scale workers
docker-compose up -d --scale workers=5

# Scale API (with load balancer)
docker-compose up -d --scale api=3
```

### Vertical Scaling
```yaml
# docker-compose.override.yml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

---

## 🚨 Troubleshooting

### API no responde
```bash
# Check container status
docker-compose ps api

# View logs
docker-compose logs api

# Restart container
docker-compose restart api

# Check database connection
docker-compose exec api wget -qO- http://postgres:5432
```

### Database connection errors
```bash
# Check postgres status
docker-compose ps postgres

# View postgres logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U booking -d bookings

# Restart postgres
docker-compose restart postgres
```

### Nginx errors
```bash
# Test nginx config
docker-compose exec nginx nginx -t

# View nginx logs
docker-compose logs nginx

# Reload nginx
docker-compose exec nginx nginx -s reload
```

---

## 📝 Próximos Pasos

- [ ] Add Prometheus metrics endpoint
- [ ] Add Grafana dashboards
- [ ] Add Jaeger tracing
- [ ] Add ELK stack for logs
- [ ] Add Kubernetes manifests
- [ ] Add Helm chart
- [ ] Add auto-scaling policies

---

**Última actualización:** 2026-03-24  
**Mantenido por:** Booking Titanium Team
