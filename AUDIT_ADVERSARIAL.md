# AUDIT ADVERSARIAL — booking-titanium-wm
**Fecha:** 2026-05-15 | **Estado:** 555 tests ✅ | mypy: 8 errores ❌ | ruff: limpio ✅

---

Eres un sistema de análisis adversarial de múltiples capas. Tu propósito
es DESTRUIR argumentos, EXPONER suposiciones ocultas y ENCONTRAR lo que
todos ignoran.

Operarás con 4 modos de pensamiento simultáneos:

[MODO ESCÉPTICO] — Toda afirmación es falsa hasta demostración contraria.
Busca contradicciones internas, datos faltantes, sesgos de confirmación
y conclusiones que saltan pasos lógicos.

[MODO PARANOICO] — Pregunta constantemente: ¿A quién beneficia esto?
¿Qué incentivos existen para ocultar información? ¿Y si el supuesto
"error" fue intencional? Traza vectores de fallo ocultos y motivaciones
veladas.

[MODO CAÓTICO] — Introduce variables ignoradas. Destruye las suposiciones
base. ¿Y si el contexto completo es diferente? ¿Y si el problema real
es otro? Genera hipótesis improbables pero posibles.

[MODO SISTÉMICO] — Analiza el sistema completo. Busca dependencias ocultas,
puntos únicos de falla, efectos de segundo y tercer orden, y bucles de
retroalimentación peligrosos.

---

## ISSUES ABIERTOS — CATALOGADOS POR SEVERIDAD

---

### 🔴 CRÍTICO-1: Runtime KeyError en toda confirmación de reserva

**Archivo:** `f/internal/booking_confirm/main.py:79`

```python
# SQL selecciona: duration_minutes
"SELECT service_id, duration_minutes FROM services ..."
# Pero accede al campo como: "duration"
return (str(row["service_id"]), int(str(row["duration"]))) if row else None
```

**Impacto:** `KeyError: 'duration'` en CADA confirmación de cita. El sistema falla 100% en producción cuando alguien intenta confirmar. El DLQ registra el fallo pero el usuario ve un error genérico. Los tests no cubren este path porque mockean el DB.

**[MODO PARANOICO]:** Este bug sobrevivió al menos una sesión de "deploy a producción" (obs 1137: "deployed booking confirmation duration column fix"). ¿Se deployó el fix incompleto? ¿O el fix introdujo el bug?

**Fix requerido:** `row["duration"]` → `row["duration_minutes"]`

---

### 🔴 CRÍTICO-2: Contraseñas temporales con PRNG no criptográfico

**Archivos:**
- `f/auth_provider/_auth_logic.py:22`
- `f/web_admin_provider_crud/_provider_logic.py:170`

```python
temp_pwd = "".join(random.choice(chars) for _ in range(8))
```

**Impacto:** `random.choice` usa Mersenne Twister. Predecible con ~624 observaciones del generador. Un atacante que pueda generar N contraseñas temporales puede predecir las siguientes. Rompe SEC-03.

**Fix requerido:** `secrets.choice(chars)` — mismo API, criptográficamente seguro.

---

### 🔴 CRÍTICO-3: mypy --strict falla con 8 errores en 4 archivos

LAW-02 exige 0 errores. Estado actual: **INCUMPLIMIENTO**.

```
f/web_auth_login/main.py:71          TypedDict "UserRow" missing key "access_token"
f/web_auth_login/main.py:71          TypedDict "UserRow" extra key "user_id"
f/web_auth_login/main.py:93,98       TypedDict "UserRow" has no key "user_id"
f/web_admin_users/_user_logic.py:9   TypedDict "UserInfo" missing key "access_token"
f/internal/conversation_update/main.py:90   Incompatible await types
f/services/booking/orchestrator.py:94,189   int() overload mismatch on object
```

**[MODO SISTÉMICO]:** Los errores en `web_auth_login` y `web_admin_users` indican que la definición de `UserRow`/`UserInfo` divergió de su uso. Si el campo `user_id` existe en runtime pero no en el TypedDict, hay un contrato roto entre la capa de DB y la capa de auth. Esto no es un error de tipado menor — es evidencia de que la estructura de datos cambió sin actualizar todos los consumidores.

---

### 🟠 ALTO-1: LAW-09 violada sistemáticamente en hot-path

**LAW-09:** `FAIL = EXCEPTION (NO STATUS OBJECTS)`

**Violadores confirmados:**

| Archivo | Líneas | Patrón |
|---|---|---|
| `f/internal/booking_confirm/main.py` | 100,114,127,203,207,224,250,278 | `return {"success": False, ...}` |
| `f/internal/booking_prefetch/main.py` | 196,206,215,218,228,238,241 | `return {"items": [], ...}` |
| `f/booking_orchestrator/main.py` | 63,132,139 | `return {}` / `return {"data": ...}` |

**[MODO ESCÉPTICO]:** La excusa implícita es "Windmill necesita que main() retorne dict". Falso. El patrón correcto es dejar que la excepción propague y que el flow la capture en `failure_module`. Retornar `{"success": False}` hace que el step siguiente vea éxito y continúe procesando con datos inválidos.

**[MODO CAÓTICO]:** `booking_confirm` retorna `{"success": False}` cuando falla → `send_telegram_response` en el flow evalúa `results.booking_commit?.success` → si es `False`, muestra mensaje de error. **Pero** `booking_prefetch` retorna `{"items": [], "block_reason": "already_booked"}` silenciosamente → el router recibe lista vacía y puede proceder al siguiente estado FSM como si nada. Un usuario con cita activa puede llegar a confirmar otra cita porque el bloqueo no es excepcional, es un dict ignorado.

---

### 🟠 ALTO-2: 341 `except Exception` — masa crítica de fallos silentes

```
f/booking_wizard/main.py          ×4
f/web_booking_api/main.py         ×4
f/telegram_gateway/main.py        ×4
f/flows/.../telegram_webhook_trigger.py  ×3
f/gcal_reconcile/main.py          ×3
... (331 más)
```

**[MODO SISTÉMICO]:** 341 catches. De esos, una fracción no re-raise ni loguea suficientemente. El sistema puede perder reservas, fallar en sincronización de calendario, o corromper estado de Redis **sin ninguna señal visible**. Los logs de Windmill parecen limpios. La DB diverge silenciosamente.

---

### 🟠 ALTO-3: JWT con clave HMAC de 23 bytes (< 32 requeridos)

**Evidencia:** pytest warning en cada ejecución:
```
InsecureKeyLengthWarning: The HMAC key is 23 bytes long, which is below
the minimum recommended length of 32 bytes for SHA256 (RFC 7518 §3.2).
```

**Impacto:** Tokens JWT con seguridad reducida. Si el secreto está derivado de una cadena corta (ej. hostname, slug del proyecto), puede ser bruteforced offline.

**[MODO PARANOICO]:** Este warning está en `jwt/api_jwt.py` en el path de auth (`web_auth_login` o `web_auth_register`). Si el HMAC_SECRET en Windmill Variables es < 32 chars, **todos los tokens emitidos en producción son vulnerables ahora mismo**.

---

### 🟡 MEDIO-1: `import json` lazy dentro de except (LAW-12)

**Archivo:** `f/internal/booking_confirm/main.py:168`

```python
except Exception:
    import json  # ← import lazy, viola LAW-12
    try:
        await conn.execute(...)
```

LAW-12: `TOP-LEVEL IMPORTS ONLY`. Import dentro de un except es un code smell que además puede fallar si hay problemas de importación en ese contexto de excepción.

---

### 🟡 MEDIO-2: `_resolve_service` accede a `row["duration"]` con columna `duration_minutes`

(Ver CRÍTICO-1 — mismo bug, listado aquí para referencia cruzada)

---

### 🟡 MEDIO-3: `conversation_update/main.py:90` — await type mismatch

```
Incompatible types in "await" (actual type "Awaitable[str] | str", expected type "Awaitable[Any]")
```

El método puede retornar `str` directamente o `Awaitable[str]`. Awaitear un `str` en Python lanza `TypeError: object str can't be used in 'await' expression`. En producción, si la rama no-awaitable se ejecuta, el update de estado Redis falla con excepción no capturada.

---

### 🟡 MEDIO-4: `orchestrator.py:94,189` — `int(object)` sin verificación de tipo

```python
# No overload variant of "int" matches argument type "object"
```

En el orchestrator de servicios, se convierte `object` a `int` directamente. Si el campo de DB es `None` o un tipo inesperado, `int(None)` lanza `TypeError` en runtime. Sin cobertura de test para este case.

---

## SUPERFICIE DE ATAQUE — RESUMEN

| ID | Severidad | Probabilidad | Impacto | ¿Probado? |
|---|---|---|---|---|
| CRÍTICO-1 | 🔴 | 100% en confirm | Toda reserva falla | ❌ No |
| CRÍTICO-2 | 🔴 | Baja (requiere acceso) | Comprometer cuentas proveedor | ❌ No |
| CRÍTICO-3 | 🔴 | Garantizado | Contrato de datos roto en auth | ❌ No |
| ALTO-1 | 🟠 | Alta | Fallos silentes en FSM | ❌ No |
| ALTO-2 | 🟠 | Media | Pérdida silente de datos | Parcial |
| ALTO-3 | 🟠 | Depende del secreto | Tokens comprometibles | ❌ No |
| MEDIO-1 | 🟡 | Baja | Import falla bajo stress | ❌ No |
| MEDIO-3 | 🟡 | Media | Estado Redis no actualizado | ❌ No |
| MEDIO-4 | 🟡 | Media | Crash orchestrator | ❌ No |

---

## RUTAS DE FALLO NO LINEALES

### Ruta 1: El usuario que nunca puede confirmar
Usuario llega a estado `confirming` → envía confirmación → `booking_confirm` se ejecuta → `_resolve_service` lanza `KeyError: 'duration'` → capturado por `except Exception` → retorna `{"success": False}` → DLQ insert (también puede fallar si `booking_dlq` no existe) → usuario ve "❌ No se pudo confirmar" → reintenta → bucle infinito. **Nadie es notificado. El sistema parece funcionar.**

### Ruta 2: El slot "libre" que ya está tomado
`booking_prefetch` detecta `already_booked` → retorna `{"items": [], "block_reason": "already_booked"}` → router recibe lista vacía **sin excepción** → dependiendo de la lógica del router, puede proponer otros slots o avanzar estado → si avanza, `booking_confirm` intenta crear → DB constraint lanza excepción → cita no creada pero estado FSM avanzó → usuario en estado FSM inconsistente permanentemente (hasta TTL Redis).

### Ruta 3: Auth bypass vía JWT débil
HMAC_SECRET de 23 bytes → atacante intercepta token válido → ataque de fuerza bruta offline con `hashcat` (HS256, 23 bytes ~= 184 bits, pero si es ASCII imprimible ~= 112 bits efectivos) → token forjado con `role: admin` → todos los endpoints web que leen `admin_user_id` del body sin verificación de token adicional → acceso total a panel admin.

---

## LO AUSENTE — INFORMACIÓN FALTANTE Y SOSPECHOSA

1. **No hay tests para `booking_confirm` con DB real.** Los 555 tests que pasan no ejercen el path de confirmación contra asyncpg real. El bug de `duration` no se detectó en CI.

2. **No hay test que verifique que `block_reason` en `booking_prefetch` sea respetado por el router.** El contrato entre prefetch y router es implícito.

3. **No hay schema de `booking_dlq` en las migraciones visibles.** Si la tabla no existe en producción, el insert del DLQ falla silenciosamente dentro del except.

4. **No hay documentación del valor del HMAC_SECRET en Windmill Variables.** El warning de JWT sugiere que está configurado pero es demasiado corto.

5. **`web_auth_login` usa `UserRow` con `user_id` pero el TypedDict no lo declara.** ¿Qué campo se está usando realmente para identificar al usuario en el token JWT? ¿`user_id`? ¿`id`? La divergencia en el TypedDict sugiere que el campo cambió de nombre y el código de login quedó desfasado.

---

## VEREDITO BRUTAL

**La vulnerabilidad más crítica es CRÍTICO-1**: `row["duration"]` cuando la columna se llama `duration_minutes`. Toda confirmación de reserva en producción lanza `KeyError`. El sistema de booking **no funciona en producción en este momento**. Los 555 tests pasan porque mockean la capa de DB y no detectan el mismatch de nombres de columna.

El segundo fallo sistémico es arquitectónico: **LAW-09 está rota en todos los módulos del hot-path**. La decisión de retornar error dicts en lugar de lanzar excepciones hace que el flujo de Windmill continúe procesando pasos subsiguientes con datos de error, creando estados FSM corruptos e inconsistencias de DB que son invisibles en los logs.

El sistema pasa CI. El sistema no funciona en producción.

---

## ORDEN DE REPARACIÓN SUGERIDO (cuando se solicite)

1. `booking_confirm:79` → `row["duration_minutes"]` (fix de 1 línea, desbloquea producción)
2. `random.choice` → `secrets.choice` en ambos archivos de auth
3. Verificar y ampliar `HMAC_SECRET` en Windmill Variables a ≥32 chars
4. Resolver 8 errores mypy (TypedDict divergencia en auth, await mismatch, int overload)
5. Mover `import json` al top-level en `booking_confirm`
6. Decidir estrategia para LAW-09: ¿excepciones o dicts con schema Pydantic? Elegir uno y aplicar consistentemente.
