# Cloudflare Tunnel (cloudflared) en Docker - Best Practices

## Arquitectura de Despliegue

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Edge Network                         │
│         DDoS Protection, WAF, SSL Termination               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Tunnel (cloudflared)                 │
│         Tunnel Encriptado (sin puertos abiertos)            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Ingress Rules                                       │   │
│  │  windmill.stax.ink → http://api:8080                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              API Go (Docker :8080)                           │
│              Windmill Scripts & Flows                        │
└─────────────────────────────────────────────────────────────┘
```

## Configuración del Tunnel

### Paso 1: Crear Tunnel en Cloudflare Dashboard

```bash
# 1. Ir a Cloudflare Dashboard → Networking → Tunnels
# 2. Click "Create a tunnel"
# 3. Nombrar: "booking-titanium"
# 4. Seleccionar ambiente: "Docker"
# 5. Copiar el TOKEN (eyJ...)
```

### Paso 2: Docker Compose Configuration

```yaml
version: '3.8'

services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-tunnel
    restart: unless-stopped
    command: tunnel run
    environment:
      # Token del tunnel (copiar del dashboard)
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
      # Metrics endpoint para healthchecks
      - TUNNEL_METRICS=0.0.0.0:20244
    volumes:
      # Logs persistentes
      - ./logs/cloudflared:/var/log/cloudflared
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

  api:
    build:
      context: ..
      dockerfile: docker-compose/Dockerfile
    container_name: booking-api
    restart: unless-stopped
    expose:
      - "8080"
    environment:
      - SERVER_PORT=8080
      - DATABASE_URL=${DATABASE_URL}
    networks:
      - booking-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 3s
      retries: 3

networks:
  booking-network:
    driver: bridge
```

### Paso 3: Ingress Configuration (config.yaml)

```yaml
# config.yaml para tunnel localmente gestionado
tunnel: booking-titanium
credentials-file: /etc/cloudflared/booking-titanium.json

# Logging
logfile: /var/log/cloudflared/cloudflared.log
loglevel: info

# Metrics
metrics: 0.0.0.0:20244

# Ingress rules (EN ORDEN)
ingress:
  # API principal
  - hostname: windmill.stax.ink
    service: http://api:8080
    path: /.*
    
  # Health check endpoint (público)
  - hostname: windmill.stax.ink
    service: http://api:8080
    path: /health
    
  # Telegram webhook (solo POST)
  - hostname: windmill.stax.ink
    service: http://api:8080
    path: /api/telegram/webhook
    originRequest:
      httpMethods:
        - POST
    
  # Catch-all (debe ser el último)
  - service: http_status:404
```

### Ejecutar con config.yaml

```bash
# 1. Crear tunnel
cloudflared tunnel create booking-titanium

# 2. Descargar credenciales
cloudflared tunnel credentials booking-titanium

# 3. Mover credenciales al volumen Docker
mv booking-titanium.json ./cloudflared/

# 4. Ejecutar con config
docker run -d \
  --name cloudflared \
  -v $(pwd)/cloudflared:/etc/cloudflared \
  -v $(pwd)/logs:/var/log/cloudflared \
  cloudflare/cloudflared:latest \
  tunnel --config /etc/cloudflared/config.yaml run booking-titanium
```

## Token Management

### Obtener Token

**Opción 1: Dashboard**
```
1. Cloudflare Dashboard → Networking → Tunnels
2. Seleccionar tunnel "booking-titanium"
3. Click "Add a replica" o "Configure"
4. Copiar token del comando (cadena eyJ...)
```

**Opción 2: API**
```bash
curl -X GET "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json"
```

### Seguridad del Token

| Riesgo | Mitigación |
|--------|------------|
| Token comprometido | Rotar inmediatamente |
| Token en código | Usar variables de entorno (.env) |
| Token sin expiración | Rotar cada 90 días |
| Múltiples réplicas | Usar mismo token en todas |

### Rotar Token

```bash
# 1. Dashboard → Tunnels → booking-titanium → Rotate token
# 2. Actualizar TUNNEL_TOKEN en .env
# 3. Reiniciar cloudflared
docker-compose restart cloudflared

# 4. Verificar conexión
cloudflared tunnel list
```

### Si el Token es Comprometido

```bash
# 1. Rotar token inmediatamente (Dashboard)
# 2. Forzar desconexión de conexiones existentes
curl -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/connections" \
  -H "Authorization: Bearer $API_TOKEN"

# 3. Actualizar todas las réplicas con nuevo token
# 4. Reiniciar cloudflared en todas las réplicas
```

## Ingress Routing

### Configuración Básica

```yaml
ingress:
  # Dominio principal → API
  - hostname: windmill.stax.ink
    service: http://api:8080
    
  # Catch-all (requerido)
  - service: http_status:404
```

### Múltiples Subdominios

```yaml
ingress:
  # API principal
  - hostname: windmill.stax.ink
    service: http://api:8080
  
  # Dashboard (otro servicio)
  - hostname: dashboard.windmill.stax.ink
    service: http://dashboard:3000
  
  # Wildcard para todos los subdominios
  - hostname: "*.windmill.stax.ink"
    service: http://api:8080
  
  # Catch-all
  - service: http_status:404
```

### Routing por Path

```yaml
ingress:
  # Telegram webhook
  - hostname: windmill.stax.ink
    path: /api/telegram/webhook
    service: http://api:8080
    originRequest:
      httpMethods:
        - POST
  
  # Booking endpoints
  - hostname: windmill.stax.ink
    path: /book-appointment
    service: http://api:8080
  
  # Health check (público)
  - hostname: windmill.stax.ink
    path: /health
    service: http://api:8080
  
  # Default
  - hostname: windmill.stax.ink
    service: http://api:8080
  
  # Catch-all
  - service: http_status:404
```

### HTTPS a Origin

```yaml
ingress:
  - hostname: windmill.stax.ink
    service: https://api:8080
    originRequest:
      # Nombre del servidor en el certificado
      originServerName: api.booking-network
      
      # Skip TLS verification (solo dev)
      noTLSVerify: false
      
      # CA Pool si usas certificado self-signed
      caPool: /etc/cloudflared/ca.pem
```

## Healthchecks

### Docker Healthcheck

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    healthcheck:
      # Opción 1: Verificar endpoint /ready
      test: ["CMD", "cloudflared", "tunnel", "--metrics", "0.0.0.0:20244", "ready"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
      
      # Opción 2: Verificar versión (más simple)
      # test: ["CMD", "cloudflared", "--version"]
```

### Metrics Endpoint

```yaml
services:
  cloudflared:
    environment:
      - TUNNEL_METRICS=0.0.0.0:20244
    ports:
      # Exponer metrics (opcional, solo para monitoreo)
      - "20244:20244"
```

**Acceder a métricas:**
```bash
# Prometheus format
curl http://localhost:20244/metrics

# Ready endpoint
curl http://localhost:20244/ready
```

### Kubernetes Probes

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: cloudflared
spec:
  containers:
  - name: cloudflared
    image: cloudflare/cloudflared:latest
    env:
    - name: TUNNEL_TOKEN
      valueFrom:
        secretKeyRef:
          name: cloudflared-secret
          key: tunnel-token
    livenessProbe:
      httpGet:
        path: /ready
        port: 20244
      initialDelaySeconds: 10
      periodSeconds: 30
      timeoutSeconds: 10
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /ready
        port: 20244
      initialDelaySeconds: 5
      periodSeconds: 10
      timeoutSeconds: 5
      successThreshold: 1
```

## Monitoreo

### Dashboard Status

| Estado | Significado | Acción |
|--------|-------------|--------|
| **Healthy** | Activo, 4 conexiones | ✅ Normal |
| **Inactive** | Creado pero nunca corrió | Ejecutar cloudflared |
| **Down** | Conectado antes, ahora no | Revisar logs, reiniciar |
| **Degraded** | Algunas conexiones fallaron | Revisar firewall, red |

### Comandos de Diagnóstico

```bash
# Listar tunnels
cloudflared tunnel list

# Ver estado detallado
cloudflared tunnel info booking-titanium

# Ejecutar con debug logging
cloudflared tunnel --loglevel debug run booking-titanium

# Logs persistentes
cloudflared tunnel --logfile /var/log/cloudflared.log run booking-titanium
```

### Logs en Docker

```yaml
services:
  cloudflared:
    volumes:
      - ./logs/cloudflared:/var/log/cloudflared
    command: tunnel run --logfile /var/log/cloudflared/cloudflared.log --loglevel info
```

**Ver logs:**
```bash
# En tiempo real
docker-compose logs -f cloudflared

# Últimas 100 líneas
docker-compose logs --tail=100 cloudflared

# Desde archivo
tail -f ./logs/cloudflared/cloudflared.log
```

### Notificaciones

```
Configurar en Cloudflare Dashboard:
1. Cloudflare One → Settings → Notifications
2. Create notification
3. Event type: "Tunnel Health Alert"
4. Canal: Email, Slack, Webhook
```

## Troubleshooting

### Tunnel No Conecta

**Error: `ERR edge discovery: error looking up Cloudflare edge IPs`**

```bash
# Causa: DNS no resuelve SRV records
# Solución: Usar DNS de Cloudflare

# Verificar DNS
dig SRV _v2-origintunneld._tcp.argotunnel.com

# Forzar DNS de Cloudflare en Docker
docker run ... --dns 1.1.1.1 cloudflare/cloudflared
```

**Error: `ERR Failed to dial a quic connection ... timeout`**

```bash
# Causa: UDP 7844 bloqueado
# Solución: Permitir UDP 7844 o forzar HTTP/2

# Verificar conectividad
nc -uvz -w 3 region1.v2.argotunnel.com 7844

# Forzar HTTP/2 (TCP)
command: tunnel run --protocol http2
```

**Error: `ERR Unable to establish connection ... i/o timeout`**

```bash
# Causa: TCP 7844 bloqueado
# Solución: Permitir TCP 7844 a Cloudflare

# Verificar
nc -vz -w 3 region1.v2.argotunnel.com 7844

# Firewall rules necesarias:
# - TCP 7844 outbound a Cloudflare IP ranges
# - UDP 7844 outbound (opcional, para QUIC)
```

### Error 502 Bad Gateway

```bash
# Causa: cloudflared no puede reachar el origin

# 1. Verificar origin está corriendo
curl http://localhost:8080/health

# 2. Verificar puerto en ingress
# service: http://api:8080 (debe coincidir)

# 3. Verificar protocolo
# service: http://... (no https si no hay SSL)

# 4. Logs de cloudflared
docker-compose logs cloudflared | grep 502
```

### ERR_TOO_MANY_REDIRECTS

```yaml
# Causa: SSL/TLS mismatch
# Solución: Configurar originServerName

ingress:
  - hostname: windmill.stax.ink
    service: https://api:8080
    originRequest:
      originServerName: api.booking-network
```

### Token Inválido

```bash
# Error: "Tunnel credentials token is invalid"

# 1. Verificar token en .env
echo $CLOUDFLARE_TUNNEL_TOKEN

# 2. Rotar token en Dashboard
# 3. Actualizar .env
# 4. Reiniciar
docker-compose restart cloudflared
```

### DNS Record Exists

```
Error: "An A, AAAA, or CNAME record with that host already exists"

Solución:
1. Dashboard → DNS
2. Eliminar record existente
3. O usar diferente hostname
```

## Seguridad

### Sin Puertos Abiertos

```yaml
# ✅ BIEN: Sin puertos expuestos al exterior
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    # No hay "ports:" - todo el tráfico va por el tunnel
    
  api:
    expose:
      - "8080"  # Solo dentro de la red Docker
```

### Network Isolation

```yaml
networks:
  booking-network:
    driver: bridge
    internal: false  # cloudflared necesita internet
    
# Firewall rules en host:
# - Permitir outbound TCP 7844 a Cloudflare
# - Bloquear todo inbound excepto SSH
```

### Access Policies (Zero Trust)

```
Configurar en Dashboard:
1. Zero Trust → Access → Applications
2. Add application: windmill.stax.ink
3. Policy: Require email de @tudominio.com
4. Ahora requiere autenticación para acceder
```

## Errores Comunes

### ❌ Token en Dockerfile

```dockerfile
# MAL: Token expuesto en imagen
ENV TUNNEL_TOKEN=eyJ...

# BIEN: Token en variable de entorno
# docker-compose.yml
environment:
  - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
```

### ❌ Sin Catch-all Rule

```yaml
# MAL: Sin catch-all, error de configuración
ingress:
  - hostname: windmill.stax.ink
    service: http://api:8080

# BIEN: Catch-all al final
ingress:
  - hostname: windmill.stax.ink
    service: http://api:8080
  - service: http_status:404  # Catch-all
```

### ❌ Healthcheck Incorrecto

```yaml
# MAL: Healthcheck que siempre pasa
healthcheck:
  test: ["CMD", "true"]

# BIEN: Verificar endpoint /ready
healthcheck:
  test: ["CMD", "cloudflared", "tunnel", "--metrics", "0.0.0.0:20244", "ready"]
```

### ❌ Logs Sin Persistencia

```yaml
# MAL: Logs se pierden al reiniciar
# Sin volumes

# BIEN: Logs persistentes
volumes:
  - ./logs/cloudflared:/var/log/cloudflared
```

### ❌ Múltiples Tunnels para Mismo Dominio

```bash
# MAL: Dos tunnels compitiendo
tunnel1: windmill.stax.ink → api:8080
tunnel2: windmill.stax.ink → api:8080  # Conflicto!

# BIEN: Un tunnel con múltiples ingress rules
tunnel: booking-titanium
ingress:
  - hostname: windmill.stax.ink
    service: http://api:8080
```

## Checklist Producción

- [ ] Tunnel creado en Cloudflare Dashboard
- [ ] Token guardado en .env (no commitear)
- [ ] Docker Compose con TUNNEL_TOKEN
- [ ] Ingress rules configuradas
- [ ] Catch-all rule al final
- [ ] Healthcheck configurado (/ready endpoint)
- [ ] Metrics endpoint habilitado (0.0.0.0:20244)
- [ ] Logs persistentes configurados
- [ ] Firewall permite outbound TCP 7844
- [ ] DNS CNAME apuntando a tunnel ID
- [ ] Notificaciones de salud configuradas
- [ ] Token rotation schedule (90 días)
- [ ] Runbook para troubleshooting
