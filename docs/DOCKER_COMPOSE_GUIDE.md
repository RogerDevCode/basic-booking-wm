# 🐳 GUÍA DE DOCKER COMPOSE - NUEVA ESTRUCTURA

**Fecha:** 2026-03-24  
**Cambio:** Carpetas autocontenidas para Docker

---

## 📂 NUEVA ESTRUCTURA

```
booking-titanium-wm/
├── docker-compose/              # PRODUCCIÓN
│   ├── .env                     # ¡ACTUALIZAR CON TUS VALORES!
│   ├── .env.example
│   ├── docker-compose.yml       # Full stack
│   ├── nginx/
│   │   └── nginx.conf
│   ├── ssl/                     # Generar certificados
│   ├── database/
│   │   └── init/
│   │       └── 001_init.sql
│   └── README.md
│
├── docker-compose.dev/          # DESARROLLO
│   ├── .env                     # Configurado para local
│   ├── .env.example
│   ├── docker-compose.yml       # DB + Redis only
│   ├── database/
│   │   └── init/
│   │       └── 001_init.sql
│   └── README.md
│
└── (resto del proyecto)
```

---

## 🎯 DIFERENCIAS CLAVE

| Aspecto | docker-compose/ (Prod) | docker-compose.dev/ (Dev) |
|---------|------------------------|---------------------------|
| **Propósito** | Producción | Desarrollo |
| **Servicios** | API + Workers + DB + Redis + Nginx + PgAdmin | DB + Redis |
| **PostgreSQL** | 17-alpine | 17-alpine |
| **Puertos** | Externos solo Nginx (80, 443) | DB (5432), Redis (6379) |
| **Red** | Aislada (booking-network) | Aislada (booking-dev-network) |
| **Volumen** | Persistentes | Persistentes |
| **Tests** | Dentro de Docker | Fuera de Docker (local) |

---

## 🚀 QUICK START

### Desarrollo (Recomendado)

```bash
# 1. Start DB + Redis
make dev-services
# O: docker-compose -f docker-compose.dev/docker-compose.yml up -d

# 2. Correr tests local (rápido)
go test ./... -v

# 3. Run API local
make dev

# 4. Stop
make dev-stop
```

### Producción

```bash
# 1. Configurar .env
cd docker-compose
cp .env.example .env
nano .env  # ¡CAMBIAR PASSWORDS!

# 2. Generar SSL
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem

# 3. Start full stack
docker-compose -f docker-compose/docker-compose.yml up -d

# 4. Verificar
docker-compose -f docker-compose/docker-compose.yml ps
```

---

## 📋 COMANDOS ACTUALIZADOS

### Desarrollo

```bash
# Start DB + Redis
make dev-services

# Stop
make dev-stop

# Run API local
make dev

# Tests unitarios
make test-unit

# Tests integración
make test-integration

# Database shell
make db-shell

# Backup
make db-backup
```

### Producción

```bash
# Build
docker-compose -f docker-compose/docker-compose.yml build

# Start
docker-compose -f docker-compose/docker-compose.yml up -d

# Stop
docker-compose -f docker-compose/docker-compose.yml down

# Logs
docker-compose -f docker-compose/docker-compose.yml logs -f api
```

---

## 🔑 VARIABLES DE ENTORNO

### Desarrollo (.env en docker-compose.dev/)

```bash
POSTGRES_USER=booking
POSTGRES_PASSWORD=booking123
POSTGRES_DB=bookings
POSTGRES_PORT=5432

# Tests conectan a:
DATABASE_URL=postgresql://booking:booking123@localhost:5432/bookings?sslmode=disable
```

### Producción (.env en docker-compose/)

```bash
POSTGRES_USER=booking
POSTGRES_PASSWORD=¡CAMBIAR_ESTO!
POSTGRES_DB=bookings
POSTGRES_PORT=5432

# API conecta vía Docker network:
DATABASE_URL=postgresql://booking:PASSWORD@postgres:5432/bookings?sslmode=disable
```

---

## 🗂️ ARCHIVOS POR CARPETA

### docker-compose/ (Producción)

```
.env                      # ¡ACTUALIZAR!
docker-compose.yml        # Full stack
nginx/nginx.conf          # Reverse proxy
ssl/cert.pem              # Generar
ssl/key.pem               # Generar
database/init/001_init.sql
README.md
.gitignore
```

### docker-compose.dev/ (Desarrollo)

```
.env                      # Listo para usar
docker-compose.yml        # DB + Redis
database/init/001_init.sql
README.md
.gitignore
```

---

## 🔄 MIGRACIÓN DESDE ESTRUCTURA ANTIGUA

### Si usabas docker-compose.yml en la raíz:

```bash
# 1. La estructura antigua ya no existe
# 2. Usar nuevas carpetas

# Desarrollo:
docker-compose -f docker-compose.dev/docker-compose.yml up -d

# Producción:
docker-compose -f docker-compose/docker-compose.yml up -d
```

### Makefile actualizado:

```bash
# Todos los comandos make siguen funcionando
make dev-services      # Usa docker-compose.dev/
make docker-up         # Usa docker-compose/
make db-shell          # Usa docker-compose.dev/
```

---

## 💡 VENTAJAS DE ESTA ESTRUCTURA

1. **Aislamiento total:** Cada carpeta es autocontenida
2. **Sin conflictos:** Dev y Prod separados
3. **.env por carpeta:** Config independiente
4. **Fácil de borrar:** `rm -rf docker-compose.dev/` no afecta prod
5. **Claro propósito:** Sabés qué es cada carpeta
6. **Tests rápidos:** Dev usa DB Docker, tests local

---

## 🚨 IMPORTANTE

### .env en docker-compose/ (Producción)

```bash
# ¡CAMBIAR ESTO!
POSTGRES_PASSWORD=secure_password_here
REDIS_PASSWORD=secure_password_here

# Configurar SSL
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
NGINX_SERVER_NAME=your-domain.com
```

### .env en docker-compose.dev/ (Desarrollo)

```bash
# Ya configurado para local
POSTGRES_PASSWORD=booking123
REDIS_PASSWORD=
POSTGRES_PORT=5432

# Tests conectan via localhost
DATABASE_URL=postgresql://booking:booking123@localhost:5432/bookings?sslmode=disable
```

---

## 📖 DOCUMENTACIÓN COMPLETA

- **Producción:** `docker-compose/README.md`
- **Desarrollo:** `docker-compose.dev/README.md`

---

**Última actualización:** 2026-03-24  
**Versión:** 2.0.0
