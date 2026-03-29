# Nginx Reverse Proxy en Docker para API Go - Best Practices

## Arquitectura de Despliegue

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Tunnel (windmill.stax.ink)          │
│              SSL Termination, DDoS Protection               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Nginx Reverse Proxy (Docker)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Rate Limiting (10r/s per IP)                       │   │
│  │  Gzip Compression                                   │   │
│  │  Security Headers                                   │   │
│  │  TLS 1.3 Termination                                │   │
│  │  Attack Protection                                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              API Go (cmd/api/main.go :8080)                 │
│              Upstream Keepalive Connections                 │
└─────────────────────────────────────────────────────────────┘
```

## Configuración Principal (nginx.conf)

```nginx
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ============================================================================
    # LOGGING FORMAT
    # ============================================================================
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main;

    # ============================================================================
    # PERFORMANCE OPTIMIZATIONS
    # ============================================================================
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;  # Ocultar versión de Nginx

    # ============================================================================
    # RATE LIMITING ZONES
    # ============================================================================
    # 10 requests per second per IP (10 MB zone)
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    
    # Concurrent connections per IP (10 MB zone)
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    
    # Rate limiting for specific endpoints (más estricto)
    limit_req_zone $binary_remote_addr zone=booking_limit:10m rate=5r/s;

    # ============================================================================
    # GZIP COMPRESSION
    # ============================================================================
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types 
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/x-javascript
        application/xml
        application/xml+rss
        application/xhtml+xml
        image/svg+xml
        font/woff
        font/woff2;

    # ============================================================================
    # SECURITY HEADERS (Globales)
    # ============================================================================
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ============================================================================
    # UPSTREAM (API Go Backend)
    # ============================================================================
    upstream api_backend {
        server api:8080;
        
        # Keepalive connections to upstream
        keepalive 32;
        keepalive_timeout 60s;
        keepalive_requests 1000;
    }

    # ============================================================================
    # MAIN SERVER BLOCK
    # ============================================================================
    server {
        listen 80;
        server_name _;

        # Redirect HTTP to HTTPS (en producción)
        # return 301 https://$server_name$request_uri;

        # Health check endpoint (sin rate limiting)
        location = /health {
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API endpoints con rate limiting
        location / {
            # Rate limiting con burst
            limit_req zone=api_limit burst=20 nodelay;
            limit_conn conn_limit 10;
            
            # Manejo de errores de rate limiting
            limit_req_status 429;
            limit_conn_status 429;

            # Proxy settings
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;

            # Buffering
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
            proxy_busy_buffers_size 8k;
        }

        # Booking endpoints (rate limiting más estricto)
        location /book-appointment {
            limit_req zone=booking_limit burst=10 nodelay;
            limit_conn conn_limit 5;
            
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            # ... resto de proxy settings
        }

        # Error pages
        error_page 429 /429.html;
        location = /429.html {
            internal;
            default_type application/json;
            return 429 '{"success":false,"error":"rate_limit_exceeded","message":"Too many requests"}';
        }

        error_page 500 502 503 504 /50x.html;
        location = /50x.html {
            root /usr/share/nginx/html;
        }
    }

    # ============================================================================
    # HTTPS SERVER BLOCK (Producción)
    # ============================================================================
    # server {
    #     listen 443 ssl http2;
    #     server_name windmill.stax.ink;
    #
    #     # SSL Certificates
    #     ssl_certificate /etc/nginx/ssl/cert.pem;
    #     ssl_certificate_key /etc/nginx/ssl/key.pem;
    #
    #     # TLS 1.3 Only (Modern)
    #     ssl_protocols TLSv1.3;
    #
    #     # Session settings
    #     ssl_session_timeout 1d;
    #     ssl_session_cache shared:SSL:10m;
    #     ssl_session_tickets off;
    #
    #     # OCSP Stapling
    #     ssl_stapling on;
    #     ssl_stapling_verify on;
    #     ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
    #     resolver 127.0.0.53 valid=300s;
    #     resolver_timeout 5s;
    #
    #     # Security Headers (HTTPS)
    #     add_header Strict-Transport-Security "max-age=63072000" always;
    #     add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" always;
    #
    #     # ... resto de configuración
    # }
}
```

## Rate Limiting Detallado

### Configuración por Tipo de Endpoint

```nginx
http {
    # Zones diferentes para diferentes tipos de endpoints
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=booking:10m rate=5r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=3r/s;
    limit_req_zone $binary_remote_addr zone=health:10m rate=1r/s;

    server {
        # Endpoints generales (10r/s + burst 20)
        location /api/v1/providers {
            limit_req zone=general burst=20 nodelay;
            proxy_pass http://api_backend;
        }

        # Booking endpoints (5r/s + burst 10) - más estricto
        location /api/v1/book-appointment {
            limit_req zone=booking burst=10 nodelay;
            proxy_pass http://api_backend;
        }

        # Auth endpoints (3r/s + burst 5) - muy estricto
        location /api/v1/auth {
            limit_req zone=auth burst=5 nodelay;
            proxy_pass http://api_backend;
        }

        # Health check (1r/s, sin burst) - mínimo
        location = /health {
            limit_req zone=health;
            proxy_pass http://api_backend;
        }
    }
}
```

### Burst y Nodelay Explicados

```nginx
# Sin burst (estricto)
# 10r/s significa: 1 request cada 100ms
# Request 1: ✅ OK
# Request 2 (50ms después): ❌ 429 Too Many Requests
limit_req zone=api_limit;

# Con burst=20 (permite picos)
# Request 1-21: ✅ OK (20 en cola)
# Request 22: ❌ 429
limit_req zone=api_limit burst=20;

# Con burst=20 nodelay (procesa inmediatamente)
# Request 1-21: ✅ OK (procesados inmediatamente)
# Request 22: ❌ 429
limit_req zone=api_limit burst=20 nodelay;

# Con burst=20 delay=5 (delay después de 5)
# Request 1-5: ✅ OK (inmediato)
# Request 6-21: ✅ OK (con delay)
# Request 22: ❌ 429
limit_req zone=api_limit burst=20 delay=5;
```

### Whitelist de IPs (ej: Cloudflare)

```nginx
http {
    # Geo para whitelist
    geo $whitelist {
        default 0;
        172.16.0.0/12 1;      # Docker networks
        10.0.0.0/8 1;         # Private network
        103.21.244.0/22 1;    # Cloudflare IPs
        103.22.200.0/22 1;
        # ... más IPs de Cloudflare
    }

    # Zone que excluye whitelist
    limit_req_zone $whitelist zone=api_limit:10m rate=10r/s;

    server {
        location / {
            # Solo rate limita si $whitelist = 0
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://api_backend;
        }
    }
}
```

## Gzip Compression

### Configuración Óptima

```nginx
http {
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;  # Balance CPU/compression (1-9)
    gzip_min_length 256;  # No comprimir < 256 bytes
    
    # Tipos a comprimir
    gzip_types 
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/x-javascript
        application/xml
        application/xml+rss
        application/xhtml+xml
        image/svg+xml
        font/woff
        font/woff2;
    
    # Logging de compresión
    gzip_disable "msie6";
    gzip_http_version 1.1;
}
```

### Brotli Alternative (Mejor que Gzip)

```nginx
# Instalar módulo Brotli
# apt-get install nginx-module-brotli

http {
    # Brotli (15-25% mejor que gzip)
    brotli on;
    brotli_comp_level 6;
    brotli_min_length 256;
    brotli_types 
        text/plain
        text/css
        application/json
        application/javascript;
    
    # Gzip como fallback
    gzip on;
    gzip_types ...;
}
```

## Keepalive Configuration

### Upstream Keepalive

```nginx
http {
    upstream api_backend {
        server api:8080;
        
        # Conexiones keepalive al upstream
        keepalive 32;  # Máx conexiones idle
        keepalive_timeout 60s;  # Tiempo de idle
        keepalive_requests 1000;  # Requests por conexión
    }

    server {
        location / {
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            
            # CRÍTICO: Eliminar Connection: close
            proxy_set_header Connection "";
            
            # Headers adicionales
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

### Client Keepalive

```nginx
http {
    # Keepalive con clientes
    keepalive_timeout 65;  # Tiempo de idle con cliente
    keepalive_requests 100;  # Requests por conexión
    keepalive_disable none;  # Habilitar para todos los navegadores
}
```

## Security Headers

### Headers Esenciales

```nginx
server {
    # Prevenir clickjacking
    add_header X-Frame-Options "SAMEORIGIN" always;
    
    # Prevenir MIME sniffing
    add_header X-Content-Type-Options "nosniff" always;
    
    # XSS protection (legacy, pero útil)
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Controlar referrer
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Content Security Policy (ajustar según necesidades)
    add_header Content-Security-Policy 
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "font-src 'self' data:; "
        "img-src 'self' data: https:; "
        "frame-ancestors 'self';" 
        always;
}
```

### HSTS (HTTPS Only)

```nginx
server {
    listen 443 ssl;
    
    # HSTS: Forzar HTTPS por 2 años
    add_header Strict-Transport-Security 
        "max-age=63072000; includeSubDomains; preload" 
        always;
    
    # Preload en https://hstspreload.org
}
```

## TLS 1.3 Configuration

### Modern Configuration (TLS 1.3 Only)

```nginx
server {
    listen 443 ssl http2;
    
    # Certificates
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # TLS 1.3 Only
    ssl_protocols TLSv1.3;
    
    # Session settings
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;  # Deshabilitar tickets (seguridad)
    
    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
    resolver 127.0.0.53 valid=300s;
    resolver_timeout 5s;
    
    # Prefer server ciphers
    ssl_prefer_server_ciphers off;  # TLS 1.3 no necesita
}
```

### Intermediate Configuration (TLS 1.2 + 1.3)

```nginx
server {
    listen 443 ssl http2;
    
    # TLS 1.2 + 1.3
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # Ciphers para TLS 1.2
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';
    ssl_prefer_server_ciphers off;
    
    # DH Parameters (generar con: openssl dhparam -out dhparam.pem 4096)
    ssl_dhparam /etc/nginx/dhparam.pem;
    
    # ... resto de configuración TLS
}
```

## Protección Contra Ataques

### Timeouts (Slowloris Protection)

```nginx
http {
    # Timeout para body del cliente
    client_body_timeout 10s;
    
    # Timeout para headers del cliente
    client_header_timeout 10s;
    
    # Timeout para enviar response
    send_timeout 10s;
    
    # Keepalive timeout
    keepalive_timeout 65s;
}
```

### Buffer Limits (Request Size Attacks)

```nginx
http {
    # Tamaño máximo del body (10MB)
    client_max_body_size 10m;
    
    # Buffer para body
    client_body_buffer_size 16k;
    
    # Buffer para headers (1KB default)
    client_header_buffer_size 1k;
    
    # Buffers para headers grandes (4 buffers de 8KB)
    large_client_header_buffers 4 8k;
}
```

### DDoS Mitigation

```nginx
http {
    # Rate limiting global
    limit_req_zone $binary_remote_addr zone=global:10m rate=10r/s;
    
    # Concurrent connections por IP
    limit_conn_zone $binary_remote_addr zone=perip:10m;
    
    server {
        location / {
            # Limitar requests
            limit_req zone=global burst=20 nodelay;
            
            # Limitar conexiones concurrentes
            limit_conn perip 10;
            
            # Status codes personalizados
            limit_req_status 429;
            limit_conn_status 429;
            
            proxy_pass http://api_backend;
        }
    }
}
```

### IP Blacklisting

```nginx
http {
    # Blacklist de IPs
    geo $blacklist {
        default 0;
        192.168.1.100 1;  # IP específica
        10.0.0.0/8 1;     # Rango completo
    }
    
    server {
        # Bloquear IPs en blacklist
        if ($blacklist) {
            return 403;
        }
        
        location / {
            proxy_pass http://api_backend;
        }
    }
}
```

## Docker Compose Configuration

### Producción (8 servicios)

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: booking-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
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
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - booking-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  postgres:
    image: postgres:17-alpine
    container_name: booking-db
    restart: unless-stopped
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - booking-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  booking-network:
    driver: bridge

volumes:
  postgres_data:
    driver: local
```

## Errores Comunes

### ❌ No Usar Keepalive con Upstream

```nginx
# MAL: Conexión nueva por cada request
upstream api_backend {
    server api:8080;
}

# BIEN: Conexiones persistentes
upstream api_backend {
    server api:8080;
    keepalive 32;
}

location / {
    proxy_pass http://api_backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";  # CRÍTICO
}
```

### ❌ Rate Limiting Sin Burst

```nginx
# MAL: Sin burst, picos causan 429
limit_req zone=api_limit;

# BIEN: Con burst para picos
limit_req zone=api_limit burst=20 nodelay;
```

### ❌ Security Headers Sin "always"

```nginx
# MAL: Headers no se envían en errores
add_header X-Frame-Options "SAMEORIGIN";

# BIEN: Siempre enviar
add_header X-Frame-Options "SAMEORIGIN" always;
```

### ❌ TLS 1.3 Sin Deshabilitar Tickets

```nginx
# MAL: Session tickets pueden ser inseguros
ssl_session_tickets on;

# BIEN: Deshabilitar tickets
ssl_session_tickets off;
```

### ❌ Gzip Para Todo

```nginx
# MAL: Comprimir imágenes (ya están comprimidas)
gzip_types image/png image/jpeg;

# BIEN: Solo texto
gzip_types text/plain application/json application/javascript;
```

## Checklist Producción

- [ ] Rate limiting configurado (10r/s por IP)
- [ ] Burst configurado (20 para general, 10 para booking)
- [ ] Gzip habilitado con compresión nivel 6
- [ ] Keepalive upstream (32 conexiones)
- [ ] Keepalive cliente (65s timeout)
- [ ] Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- [ ] TLS 1.3 configurado
- [ ] OCSP Stapling habilitado
- [ ] HSTS habilitado (HTTPS only)
- [ ] Timeouts configurados (client_body, client_header, send)
- [ ] Buffer limits configurados (max_body_size, large_client_header_buffers)
- [ ] Health check endpoint sin rate limiting
- [ ] Logs configurados con formato detallado
- [ ] server_tokens off (ocultar versión)
- [ ] Error pages personalizadas (429, 50x)
