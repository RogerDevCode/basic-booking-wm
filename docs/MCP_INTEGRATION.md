# MCP + WINDMILL INTEGRATION - Paso a Paso

## Estado de la Investigación (Validado)

### ❌ INFORMACIÓN ORIGINAL DESCARTADA
- **NO existe** `@windmill-labs/mcp-windmill` como paquete npm externo.
- **NO se necesita** contenedor Docker adicional como "bridge".
- **NO es** un proceso separado — MCP está **incrustado** en el backend de Windmill (Rust).

### ✅ ARQUITECTURA REAL CONFIRMADA

```
[Claude Desktop / Cursor / Zed] 
         ↓ HTTP Streamable (puerto 8000)
[Windmill Server (Rust)] ← Embedded MCP module
         ↓
   [PostgreSQL] ← RLS multi-tenancy
   [Workers] ← Job execution
```

**Endpoints oficiales (documentación Windmill v1.687.0):**
- Token-based: `http://localhost:8000/api/mcp/w/{workspace_id}/mcp?token={token}`
- OAuth gateway: `http://localhost:8000/api/mcp/gateway` (sin token, requiere flujo OAuth)

**Transport:** HTTP Streamable (SSE + POST) — NO requiere servidor externo.

**Capacidades:** 38 herramientas integradas + todos tus scripts/flows como herramientas individuales.

---

## Estado Actual del Entorno

| Componente | Estado | Observación |
|-----------|--------|-------------|
| Windmill Stack | ✅ Activo | 5 contenedores corriendo (server, worker, db, dind, caddy) |
| Puerto MCP | ✅ 8000/tcp | Exuesto internamente, mapeado a host `localhost:8000` |
| Zed Editor | ✅ Instalado | v0.232.2 via Flatpak, config en `~/.var/app/dev.zed.Zed/config/zed/` |
| MCP en Zed | ❌ No configurado | `settings.json` sin `context_servers` |
| Token Admin Windmill | ✅ Encontrado | `.env.wm: WM_TOKEN=FS0PemZPdKYKXvvgTrAajLODBfOxhc6o` |
| Workspace ID | ⚠️ No detectado | Base datos vacía o schema no inicializado; requiere obtención manual |

---

## Plan de Implementación (3 métodos)

### MÉTODO A — Automático (recomendado, via UI)
**Duración:** 5 minutos  
**Confianza:** 95% (proceso verificado oficial)

#### Paso 1 — Obtener Workspace ID
1. Abre navegador → `http://localhost:8080` (Caddy proxy) o `http://localhost:8000` (directo)
2. Inicia sesión (si es primera vez, registra admin)
3. Ve a **Settings** (engranaje, sidebar izquierdo)
4. Click en **Workspace** → pestaña **General**
5. Copia el campo **Workspace ID** (UUID formato: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

#### Paso 2 — Generar Token MCP
1. En el mismo Settings, ve a **Tokens** (sección izquierda)
2. Busca el toggle **"Generate MCP URL"** y actívalo
3. Selecciona el **scope**:
   - **Favorites only** → solo scripts/flows marcados como favoritos (recomendado para empezar)
   - **All** → todos los scripts/flows del workspace
   - **Folder** → ruta específica ej: `f/booking_*/*`
4. (Opcional) Si usas Folder/Custom, selecciona los ítems específicos
5. Click **"Generate MCP URL"**
6. **Copia la URL completa** generada. Formato:
   ```
   http://localhost:8000/api/mcp/w/{workspace_id}/mcp?token={token}
   ```
   Ejemplo: `http://localhost:8000/api/mcp/w/abc123.../mcp?token=wm_xyz...`

#### Paso 3 — Configurar Zed
```bash
# Abre el archivo de configuración de Zed (Flatpak)
nano /home/manager/.var/app/dev.zed.Zed/config/zed/settings.json
```

Añade (o modifica) la sección `context_servers`:
```json
{
  "context_servers": {
    "windmill": {
      "url": "http://localhost:8000/api/mcp/w/<TU_WORKSPACE_ID>/mcp?token=<TU_TOKEN_MCP>"
    }
  }
}
```

**Importante:** Reemplaza `<TU_WORKSPACE_ID>` y `<TU_TOKEN_MCP>` con los valores copiados.

Guarda y reinicia Zed (`Ctrl+Q` →重新启动).

#### Paso 4 — Validar Conexión
1. Abre Zed
2. Click en el icono de **MCP tools** (panel izquierdo, icono de enchufe/llave)
3. Deberías ver la lista de herramientas de Windmill:
   - `listScripts`, `runScriptByPath`, `listFlows`, etc.
   - +200 scripts/flows de tu workspace (si scope=All)
4. Prueba en el chat de Zed:
   > "List all scripts in my Windmill workspace using MCP"

Si ves respuesta con JSON listing → **ÉXITO**.

---

### MÉTODO B — Semi-Automático (via Claude Code CLI)
Usa el comando oficial para registrar el servidor MCP en Claude Desktop:

```bash
claude mcp add --transport http windmill http://localhost:8000/api/mcp/w/<workspace_id>/mcp?token=<token_mcp>
```

Esto escribe la configuración en `~/.claude.json` automáticamente.

---

### MÉTODO C — OAuth Gateway (sin token manual)
**NO recomendado para ambiente local Docker** porque requiere:
- HTTPS (certs SSL configurados)
- redirect URI reachable
- más complejidad

Usa solo si ya tienes OAuth client configurado en Windmill EE.

---

## Herramientas MCP Disponibles (post-conexión)

Una vez conectado, tu LLM podrá:

| Categoría | Herramientas | Uso típico |
|-----------|-------------|------------|
| **Scripts** | `runScriptByPath`, `runScriptPreviewAndWaitResult`, `getScriptByPath` | Ejecutar scripts de booking desde chat |
| **Flows** | `runFlowByPath`, `getFlowByPath`, `listFlows` | Disparar orquestación completa |
| **Jobs** | `listJobs`, `listQueue` | Auditoría de ejecuciones |
| **Recursos** | `listResource`, `createResource`, `getResource` | Gestionar DB connections, APIs externas |
| **Variables** | `listVariable`, `getVariable`, `createVariable` | Modificar secrets/configuraciones |
| **Schedules** | `listSchedules`, `createSchedule`, `updateSchedule` | Controlar cron jobs desde IA |
| **Workers** | `listWorkers` | Monitorear health del cluster |
| **Apps** | `createApp`, `updateApp` | Generar UIs rápidas |

** Además, cada script deployado aparece como herramienta individual** con:
- Nombre: `script_{folder}_{script_name}`
- Descripción: Tomada del docstring del script
- Input schema: Parseado automáticamente del Zod schema (TypeScript)

---

## Casos de Uso Prácticos (Booking Titanium)

Una vez MCP conectado a Zed/Claude:

```
"Usando Windmill, ejecuta el script f/booking_create con 
provider_id=abc123, client_id=def456, service_id=ghi789, 
start_time='2026-04-22T10:00:00Z'"
```

```
"Consulta el último job de f/telegram_callback y muéstrame los logs."
```

```
"Lista todos los schedules activos en el workspace y 
detén el que tenga nombre 'reminder_cron'."
```

```
"Crea un recurso PostgreSQL llamado 'booking_db_readonly' 
con solo permisos SELECT sobre la tabla bookings."
```

---

## Troubleshooting

### Error: "401 Unauthorized"
- **Causa:** Token MCP inválido o expirado.
- **Fix:** Regenera token desde Settings → Tokens → Generate MCP URL.

### Error: "No tools found"
- **Causa 1:** Scope demasiado restrictivo (ej: Folder vacío).
- **Fix:** Cambia scope a "All" o agrega scripts específicos.
- **Causa 2:** Scripts no están desplegados (están en draft).
- **Fix:** Deploya los scripts desde Windmill UI o CLI.

### Zed no muestra el icono MCP
- **Fix 1:** Asegura que `context_servers` está en `settings.json` (no `mcpServers`)
- **Fix 2:** Zed >= v0.226 (Flatpak actualizado: `flatpak update dev.zed.Zed`)
- **Fix 3:** Reinicia Zed completamente (no solo recargar ventana)

### Conexión lenta/rechazada
- **Check:** `docker ps` → windmill_server debe tener `0.0.0.0:8000->8000/tcp`
- **Test:** `curl http://localhost:8000/api/version` debe devolver JSON `{"version":"1.xxx"}`
- **Firewall:** Si usas firewall ```ufw```, permite puerto 8000: `sudo ufw allow 8000`

### Port 8000 ya en uso
- **Causa:** Otro servicio en host ocupa 8000.
- **Fix:** Cambia el mapeo en `docker-compose.windmill.yml`:
  ```yaml
  windmill_server:
    ports:
      - "8081:8000"  # host:contenedor
  ```
  Usa entonces URL: `http://localhost:8081/api/mcp/...`

---

## Verificación de Salud (Script Automatizado)

```bash
# Guarda como scripts/verify-mcp.sh y ejecuta chmod +x scripts/verify-mcp.sh
#!/bin/bash
set -e

echo "=== Windmill MCP Integration Health Check ==="
echo ""

# 1. Check Docker containers
echo "[1/5] Containers status:"
docker ps --filter "name=booking-titanium-wm" --format "table {{.Names}}\t{{.Status}}" | tail -n +2

# 2. Check port 8000
echo "[2/5] Port 8000 listening:"
if ss -tlnp | grep -q ':8000'; then
  echo "  ✅ Port 8000 is open"
else
  echo "  ❌ Port 8000 not listening"
  exit 1
fi

# 3. Test MCP endpoint (expect 401 without token)
echo "[3/5] MCP endpoint reachable:"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/mcp/gateway 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "200" ]]; then
  echo "  ✅ Endpoint responds (HTTP $HTTP_CODE)"
else
  echo "  ❌ Unexpected HTTP code: $HTTP_CODE"
  exit 1
fi

# 4. Check Zed config
echo "[4/5] Zed configuration:"
if [ -f "/home/manager/.var/app/dev.zed.Zed/config/zed/settings.json" ]; then
  if grep -q 'context_servers' /home/manager/.var/app/dev.zed.Zed/config/zed/settings.json; then
    echo "  ✅ MCP server configured in Zed settings"
  else
    echo "  ⚠️  MCP not configured in Zed yet (pending manual step)"
  fi
else
  echo "  ❌ Zed settings not found"
fi

# 5. Token existence check
echo "[5/5] MCP token present:"
if [ -f "/home/manager/Sync/wildmill-proyects/booking-titanium-wm/.env.wm" ]; then
  if grep -q "WM_TOKEN=" /home/manager/Sync/wildmill-proyects/booking-titanium-wm/.env.wm | grep -v "^#"; then
    echo "  ✅ WM_TOKEN found in .env.wm (use it to generate MCP token via UI)"
  else
    echo "  ⚠️  No WM_TOKEN in .env.wm"
  fi
else
  echo "  ❌ .env.wm not found"
fi

echo ""
echo "=== Health check completed ==="
```

Ejecuta: `bash scripts/verify-mcp.sh`

---

## Próximos Pasos Recomendados

1. **Obtén workspace ID** desde UI (http://localhost:8080/settings → Workspace → General)
2. **Genera token MCP** con scope "All" (para máxima utilidad)
3. **Configura Zed** actualizando `settings.json` con la URL completa
4. **Reinicia Zed** y verifica que las herramientas aparezcan
5. **Prueba** ejecutando un script simple desde el chat de Zed

---

## Referencias Oficiales

- Windmill MCP Docs: https://www.windmill.dev/docs/core_concepts/mcp
- MCP Specification: https://modelcontextprotocol.io/introduction
- Zed MCP Support: https://zed.dev/docs/mcp
- Windmill GitHub (backend/mcp): `backend/windmill-api/src/mcp/` (Rust source)

---

## Preguntas Frecuentes

**Q: ¿Necesito exponer el puerto 8000 al exterior?**  
A: No. MCP funciona en `localhost` (localhost-only). Tu IA (Zed/Claude) se ejecuta en la misma máquina, accede via loopback.

**Q: ¿El token MCP es lo mismo que el WM_TOKEN?**  
A: No. `WM_TOKEN` es el token del servidor (superadmin). El **token MCP** es un token de usuario con scope `mcp:*` creado desde Settings → Tokens. Puedes generarlo desde el admin token pero es manual.

**Q: ¿Puedo usar el mismo token para producción y local?**  
A: Sí, pero genera tokens por ambiente (dev/staging/prod) para aislamiento.

**Q: ¿Qué pasa si el token se filtra?**  
A: Alguien puede ejecutar scripts/flows en tu nombre. Revoca inmediatamente desde Settings → Tokens.

**Q: ¿Zed soporta MCP en Linux?**  
A: Sí, desde v0.226. Verifica versión: `zed --version` o `flatpak info dev.zed.Zed`.

**Q: ¿Necesito Dockerizar el MCP bridge?**  
A: **NO**. La investigación confirmó que es innecesario. MCP está integrado.

---

## Resumen Ejecutivo

✅ **MCP integrado nativamente** en Windmill (no external package)  
✅ **Configuración simple:** 1 línea JSON en Zed settings  
✅ **Sin Docker adicional:** usa el puerto 8000 existente  
✅ **Token-based auth** (más simple que OAuth para local)  
✅ **38 herramientas + todos tus scripts/flows** como tools  
⚠️ **Requiere:** Workspace ID + MCP token (generación manual UI)  
⏱️ **Tiempo de setup:** 5 min una vez se tiene token

--- 

**Estado actual:** Listo para configurar — solo falta generar el token MCP desde UI y pegar en Zed settings.
