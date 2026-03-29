# 🔐 CONFIGURACIÓN DEL MULTIPLEXOR DE ENTORNO

**Date:** 2026-03-28  
**Status:** ✅ **IMPLEMENTADO**

---

## 📋 RESUMEN

El **Multiplexor de Entorno** permite que los scripts de Windmill funcionen tanto en:
- **Desarrollo Local (Xubuntu):** Lee credenciales desde archivos en `~/.secrets/`
- **Producción (Windmill Workers):** Lee credenciales desde Windmill Variables

**Sin modificar el código** - el switch es automático vía variables de entorno.

---

## 🎯 CONFIGURACIÓN PARA DESARROLLO LOCAL

### Paso 1: Crear Directorio de Secretos

```bash
mkdir -p ~/.secrets
chmod 700 ~/.secrets
```

### Paso 2: Guardar Credenciales de Google Calendar

```bash
# Tu archivo JSON de Google Cloud Service Account
cat > ~/.secrets/booking-sa-key.json << 'EOF'
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-sa@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
EOF

chmod 600 ~/.secrets/booking-sa-key.json
```

### Paso 3: Configurar Variables de Entorno

Agregar a `~/.bashrc` o `~/.zshrc`:

```bash
# Environment Multiplexer for Windmill Scripts
export DEV_LOCAL_GCAL_KEY_PATH="$HOME/.secrets/booking-sa-key.json"
export DEV_LOCAL_TELEGRAM_TOKEN_PATH="$HOME/.secrets/telegram-token.txt"
export DEV_LOCAL_GMAIL_CREDENTIALS_PATH="$HOME/.secrets/gmail-credentials.json"
export DEV_LOCAL_DB_URL_PATH="$HOME/.secrets/db-url.txt"
```

Recargar shell:
```bash
source ~/.bashrc   # o source ~/.zshrc
```

### Paso 4: Verificar Configuración

```bash
# Verificar que las variables están seteadas
echo $DEV_LOCAL_GCAL_KEY_PATH
# Debe mostrar: /home/tu_usuario/.secrets/booking-sa-key.json

# Verificar que los archivos existen
ls -la ~/.secrets/
# Debe mostrar tus archivos de credenciales

# Probar lectura
cat ~/.secrets/booking-sa-key.json | jq .type
# Debe mostrar: "service_account"
```

---

## 🧪 TESTING LOCAL

### Ejecutar Tests Unitarios

```bash
cd /home/manager/Sync/wildmill-proyects/booking-titanium-wm

# Test del multiplexor
go test -v ./internal/windmill/...

# Test de GCal con credenciales locales
go test -v ./internal/communication/... -run TestGCal
```

### Ejecutar Script Manualmente

```bash
# Crear script de test
cat > test_gcal_local.go << 'EOF'
package main

import (
    "fmt"
    "os"
    "booking-titanium-wm/internal/communication"
)

func main() {
    // Set environment variable (simula ~/.bashrc config)
    os.Setenv("DEV_LOCAL_GCAL_KEY_PATH", "/home/manager/.secrets/booking-sa-key.json")
    
    // Test GCal event creation
    response := communication.CreateEvent(
        "2026-04-01T10:00:00-06:00",
        "Test Event",
        "Testing local multiplexer",
        "primary",
    )
    
    if response.Success {
        fmt.Println("✅ SUCCESS:", response.Data)
    } else {
        fmt.Println("❌ FAILED:", response.ErrorMessage)
    }
}
EOF

# Ejecutar test
go run test_gcal_local.go
```

---

## 🚀 CONFIGURACIÓN PARA PRODUCCIÓN (WINDMILL)

### Paso 1: Crear Variable en Windmill

En Windmill UI:
1. Ir a **Resources** → **Variables**
2. Click **New Variable**
3. Configurar:
   - **Path:** `f/gcal/credentials/service-account`
   - **Type:** `JSON`
   - **Value:** Pegar contenido de `booking-sa-key.json`
   - **Secret:** ✅ Marcar como secreto

### Paso 2: Actualizar Script Wrapper

En el script de Windmill (`f/gcal_create_event/main.script.yaml`):

```yaml
# Agregar parámetro para credenciales
parameters:
  - name: gcal_credentials_path
    type: string
    default: "f/gcal/credentials/service-account"
    description: "Windmill variable path for GCal credentials"
```

### Paso 3: El Multiplexor Hace el Resto

El código automáticamente:
- ✅ Detecta que `DEV_LOCAL_GCAL_KEY_PATH` NO está seteado en producción
- ✅ Usa `wmill.GetVariable()` para leer desde Windmill
- ✅ No requiere cambios en el código

---

## 📊 CÓDIGO DEL MULTIPLEXOR

### Implementación (`internal/communication/gcal.go`)

```go
func resolveGCALCredentials() ([]byte, error) {
    // 1. Try local development mode
    localPath := os.Getenv("DEV_LOCAL_GCAL_KEY_PATH")
    if localPath != "" {
        // Expand ~ to home directory
        if len(localPath) > 0 && localPath[0] == '~' {
            homeDir, _ := os.UserHomeDir()
            localPath = filepath.Join(homeDir, localPath[1:])
        }
        
        // Read local file
        return os.ReadFile(localPath)
    }
    
    // 2. Production mode - will use Windmill variable
    return nil, fmt.Errorf("DEV_LOCAL_GCAL_KEY_PATH not set")
}
```

### Flujo de Ejecución

```
┌─────────────────────────────────────────────────────────┐
│  Script Inicia                                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  resolveGCALCredentials()                               │
└────────────────┬────────────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌──────────────────┐  ┌──────────────────┐
│ DEV LOCAL set?   │  │ NO               │
│ YES              │  │                  │
│                  │  │ Production Mode  │
│ Local Dev Mode   │  │ → Windmill Var   │
│ → Read File      │  │                  │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         └──────────┬──────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Return Credentials   │
         │ (same format either  │
         │ way)                 │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Create GCal Client   │
         │ Use Credentials      │
         └──────────────────────┘
```

---

## 🔒 SEGURIDAD

### Desarrollo Local

| Medida | Implementación |
|--------|----------------|
| **Permisos de Directorio** | `chmod 700 ~/.secrets/` |
| **Permisos de Archivo** | `chmod 600 ~/.secrets/*.json` |
| **Git Ignore** | `~/.secrets/` en `.gitignore` global |
| **Nunca Commitear** | Verificar con `git status` |

### Producción Windmill

| Medida | Implementación |
|--------|----------------|
| **Encriptación** | Workspace secret encryption |
| **Access Control** | Windmill RBAC |
| **Audit Logs** | Windmill audit trail |
| **SOC 2** | Windmill compliant |

---

## 📁 ARCHIVOS DE SECRETOS SOPORTADOS

| Tipo | Variable de Entorno | Ruta por Defecto |
|------|---------------------|------------------|
| **Google Calendar** | `DEV_LOCAL_GCAL_KEY_PATH` | `~/.secrets/booking-sa-key.json` |
| **Telegram Bot** | `DEV_LOCAL_TELEGRAM_TOKEN_PATH` | `~/.secrets/telegram-token.txt` |
| **Gmail OAuth** | `DEV_LOCAL_GMAIL_CREDENTIALS_PATH` | `~/.secrets/gmail-credentials.json` |
| **Database URL** | `DEV_LOCAL_DB_URL_PATH` | `~/.secrets/db-url.txt` |

---

## 🧩 SCRIPTS QUE USAN EL MULTIPLEXOR

| Script | Credencial | Estado |
|--------|-----------|--------|
| `f/gcal_create_event` | Google SA | ✅ IMPLEMENTADO |
| `f/gcal_delete_event` | Google SA | ⏳ PENDING |
| `f/gmail_send` | Gmail OAuth | ⏳ PENDING |
| `f/telegram_send` | Telegram Token | ⏳ PENDING |

---

## 🐛 TROUBLESHOOTING

### Error: "failed to read local GCal credentials"

**Causa:** El archivo no existe o no tiene permisos de lectura

**Solución:**
```bash
# Verificar archivo
ls -la ~/.secrets/booking-sa-key.json

# Fix permisos
chmod 600 ~/.secrets/booking-sa-key.json

# Verificar variable
echo $DEV_LOCAL_GCAL_KEY_PATH
```

### Error: "DEV_LOCAL_GCAL_KEY_PATH not set"

**Causa:** La variable de entorno no está configurada

**Solución:**
```bash
# Agregar a ~/.bashrc o ~/.zshrc
export DEV_LOCAL_GCAL_KEY_PATH="$HOME/.secrets/booking-sa-key.json"

# Recargar
source ~/.bashrc
```

### Error: "Failed to initialize GCal client"

**Causa:** Credenciales inválidas o expiradas

**Solución:**
```bash
# Verificar formato JSON
cat ~/.secrets/booking-sa-key.json | jq .

# Regenerar credenciales en Google Cloud Console
# https://console.cloud.google.com/apis/credentials
```

---

## ✅ CHECKLIST DE CONFIGURACIÓN

### Desarrollo Local
- [ ] Crear `~/.secrets/` directorio
- [ ] Guardar `booking-sa-key.json`
- [ ] Configurar permisos (600)
- [ ] Agregar variables a `~/.bashrc`
- [ ] Recargar shell
- [ ] Verificar con `echo $DEV_LOCAL_GCAL_KEY_PATH`
- [ ] Testear con `go test`

### Producción Windmill
- [ ] Crear variable en Windmill UI
- [ ] Marcar como secreto
- [ ] Actualizar script wrapper
- [ ] Testear ejecución
- [ ] Verificar logs

---

**Implementation Status:** ✅ COMPLETE  
**Scripts Updated:** 1 (gcal_create_event)  
**Scripts Pending:** 3 (gcal_delete_event, gmail_send, telegram_send)  
**Next Step:** Configure ~/.secrets/booking-sa-key.json
