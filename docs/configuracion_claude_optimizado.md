# Configuración Optimizada de `.claudeignore` para Claude Code

Para optimizar el uso de tokens y maximizar el enfoque de Claude Code en el escalado del proyecto, he analizado la estructura de `/home/manager/Sync/wildmill-proyects/booking-titanium-wm` y la guía oficial de mejores prácticas del proyecto.

El archivo `.claudeignore` debe prevenir que Claude Code pierda tokens indexando o analizando archivos que no son parte del flujo lógico de negocio o que son voluminosos.

### 1. Documento `.claudeignore` Recomendado

Crea o actualiza el archivo `.claudeignore` en la raíz del proyecto (`/home/manager/Sync/wildmill-proyects/booking-titanium-wm/.claudeignore`):

```ignore
# --- Distracciones de desarrollo y archivos binarios ---
node_modules/
.git/
.idea/
.vscode/
dist/
build/
coverage/
*.log
*.sqlite
*.sqlite-journal
*.pem
*.key
.DS_Store

# --- Archivos temporales de auditoría y sistema ---
tmp_aa/
audits/
.ruff_cache/
.windmill/workspace.json

# --- Docker compose y configuración infra ---
docker-compose.dev/
docker-compose.production.yml
docker-compose.windmill.*
docker-compose.windmirror.yml
nginx/

# --- Documentación legada y archivos innecesarios ---
docs/best-practices/_archived/
scratch/
tree.txt
manifiesto_refactor.txt
refactor_gemini.sh
scripts/
tests/db-integration.test.ts

# --- Archivos de configuraciones locales de otras herramientas ---
.claude/
.qwen/
.kilo/
```

### 2. Estrategia de Optimización (Resumen)

Para mantener a Claude Code concentrado en el escalado:

*   **Enfoque de Contexto:** Cuando inicies una sesión de Claude Code, especifica el dominio: *"Claude, actúa como Windmill Medical Booking Architect. Enfócate exclusivamente en escalar el pipeline de `/booking_orchestrator` y la lógica de negocio en `f/`"*.
*   **Minimalismo:** No permitas que Claude lea toda la carpeta `f/` al inicio. Usa directivas específicas como: *"Analiza solo `f/booking_orchestrator/` y `f/internal/booking_fsm/`"*.
*   **SSOT (Single Source of Truth):** Instruye a Claude para que priorice `docs/TYPESCRIPT_SSOT_GUIDE.md`. Si un archivo viola esta guía, Claude debe reportarlo como error antes de intentar escalarlo.
*   **Cero Chitchat:** Configura el comportamiento de Claude (si la versión de Claude Code lo permite en el sistema operativo) o simplemente recuerda en el prompt: *"No proporciones resúmenes, explicaciones introductorias ni confirmaciones. Aplica cambios directamente siguiendo el lifecycle Investigación -> Estrategia -> Ejecución"*.

### 3. Mantenimiento del Proyecto

La carpeta `@docs/` (que ahora incluye este documento) sirve como referencia técnica para Claude. Si Claude intenta tomar una decisión arquitectónica divergente:

1.  Detén el proceso.
2.  Refiere a `docs/plans/2026-04-14-booking-rescue-operational-board.md` como el mapa de ruta actual.
3.  Cualquier cambio que rompa la compatibilidad con el esquema definido en `docs/TYPESCRIPT_SSOT_GUIDE.md` debe ser rechazado inmediatamente.

### 4. Auditoría de Salud (Pre-Push)

Antes de cualquier `wmill sync push`, asegúrate de que Claude haya validado con:
*   `npm run typecheck`
*   `npm run lint:strict` (enfocado únicamente en los archivos tocados por el escalado)
*   Ejecución de los tests específicos de la feature escalada.
