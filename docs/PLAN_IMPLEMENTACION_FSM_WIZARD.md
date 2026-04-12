# PLAN DE IMPLEMENTACIÓN — Opción 1: Semantic Router + FSM + LLM Fallback

**Objetivo:** Resolver el LOOP de especialidades y construir un wizard determinista para booking.

**Commit base:** `83f5a92` (main)

---

## FASE 0 — Contexto y Diagnóstico (0 cambios de código)

### 0.1 Problema actual

```
/start → menú → "1" → especialidades → "1" → LOOP (repite especialidades)
```

Causa: El router clasifica "1" como `book_appointment` → AI Agent genera "indícame fecha y hora" → El usuario ve el mismo menú de especialidades → Escribe "1" de nuevo → LOOP.

### 0.2 Lo que YA existe (reutilizar)

| Componente | Archivo | Estado |
|---|---|---|
| Telegram Router | `f/internal/telegram_router/main.ts` | ✅ Funciona — clasifica intents |
| Conversation State | `f/internal/conversation-state/index.ts` | ✅ Redis con TTL 30min |
| Conversation Get | `f/internal/conversation_get/main.ts` | ✅ Lee estado de Redis |
| Conversation Update | `f/internal/conversation_update/main.ts` | ✅ Escribe estado en Redis |
| AI Agent | `f/internal/ai_agent/main.ts` | ✅ Clasifica intent + ajusta por contexto |
| Flow v6.3 | `f/flows/telegram_webhook__flow/flow.yaml` | ✅ Pipeline con gates |
| Telegram Bubble | `f/internal/telegram_bubble/main.ts` | ✅ Test harness |

### 0.3 Lo que FALTA

| Gap | Descripción |
|---|---|
| FSM del wizard | No existe la máquina de estados para specialty→doctor→time→confirm |
| Respuestas por paso | El router no genera respuestas diferentes según `flow_step` |
| Query de especialidades | No hay script que busque specialties en DB |
| Query de doctores | No hay script que busque doctors por specialty |
| Query de horarios | No hay script que busque slots disponibles |
| Confirmación de booking | No hay script que confirme el booking con draft |
| Actualización de estado | `conversation_update` no escribe `flow_step` correctamente |

---

## FASE 1 — Definir la FSM del Booking Wizard

### 1.1 Estados y transiciones

```typescript
// f/internal/booking_fsm/types.ts

type BookingStep =
  | { name: 'idle' }
  | { name: 'selecting_specialty'; error?: string }
  | { name: 'selecting_doctor'; specialtyId: string; specialtyName: string }
  | { name: 'selecting_time'; specialtyId: string; doctorId: string; doctorName: string }
  | { name: 'confirming'; specialtyId: string; doctorId: string; timeSlot: string; draft: DraftBooking }
  | { name: 'completed'; bookingId: string };

interface DraftBooking {
  readonly specialty_id: string;
  readonly doctor_id: string;
  readonly start_time: string;
  readonly client_id: string;
}
```

### 1.2 Transiciones válidas

```
idle ──/crear_cita──→ selecting_specialty
selecting_specialty ──/number──→ selecting_doctor
selecting_specialty ──/volver──→ idle
selecting_doctor ──/number──→ selecting_time
selecting_doctor ──/volver──→ selecting_specialty
selecting_time ──/number──→ confirming
selecting_time ──/volver──→ selecting_doctor
confirming ──/sí──→ completed
confirming ──/no──→ selecting_time
confirming ──/volver──→ selecting_time
completed ──/cualquier──→ idle
```

### 1.3 Archivos a crear

| Archivo | Función |
|---|---|
| `f/internal/booking_fsm/types.ts` | Tipos y schemas de la FSM |
| `f/internal/booking_fsm/machine.ts` | Máquina de estados: transiciones + validación |
| `f/internal/booking_fsm/responses.ts` | Templates de respuesta por estado |
| `f/internal/booking_fsm/index.ts` | Re-exports + entrada principal |

---

## FASE 2 — Scripts de consulta de datos

### 2.1 Query de especialidades

**Archivo:** `f/internal/booking_fsm/data-specialties.ts`

- Input: `{ provider_id }`
- Output: `Specialty[]` desde tabla `services` o `provider_schedules`
- Usa `withTenantContext`

### 2.2 Query de doctores

**Archivo:** `f/internal/booking_fsm/data-doctors.ts`

- Input: `{ provider_id, specialty_id }`
- Output: `Doctor[]` desde tabla `providers` filtrado por `specialty`
- Usa `withTenantContext`

### 2.3 Query de horarios disponibles

**Archivo:** `f/internal/booking_fsm/data-slots.ts`

- Input: `{ provider_id, doctor_id, date }`
- Output: `TimeSlot[]` calculado desde `provider_schedules` menos bookings existentes
- Usa `withTenantContext` + GIST constraint check

---

## FASE 3 — Integrar FSM en el Router

### 3.1 Modificar `f/internal/telegram_router/main.ts`

Agregar lógica post-match:

```typescript
// Si hay estado activo con active_flow === 'booking_wizard':
// 1. Ignorar clasificación NLU
// 2. Usar FSM para determinar respuesta del paso actual
// 3. Validar input del usuario contra el paso actual
// 4. Avanzar o retroceder en la FSM
// 5. Generar respuesta determinista del nuevo estado
```

### 3.2 Cambios específicos

| Línea actual | Cambio |
|---|---|
| `matchCallback()` | Sin cambios — callbacks son directos |
| `matchCommand()` | Sin cambios — comandos son directos |
| `matchMenu()` | AGREGAR: si `active_flow === 'booking_wizard'`, interceptar |
| `main()` | AGREGAR: obtener estado Redis → si booking_wizard → FSM logic |

### 3.3 Nuevo módulo en router

**Archivo:** `f/internal/telegram_router/booking-wizard.ts`

```typescript
export async function handleBookingStep(
  text: string,
  state: ConversationState,
): Promise<WizardResponse> {
  const step = state.active_flow;
  const stepNum = state.flow_step;

  switch (step) {
    case 'booking_wizard':
      if (stepNum === 1) return await handleSpecialtySelection(text);
      if (stepNum === 2) return await handleDoctorSelection(text);
      if (stepNum === 3) return await handleTimeSelection(text);
      if (stepNum === 4) return await handleConfirmation(text);
      break;
    // ...
  }
}
```

---

## FASE 4 — Actualizar `conversation_update`

### 4.1 Cambios en `f/internal/conversation_update/main.ts`

- Agregar campo `flow_step` al input schema
- Actualizar `updateConversationState` para escribir `flow_step`
- Validar que `flow_step` sea coherente con `active_flow`

### 4.2 Cambios en `f/internal/conversation-state/index.ts`

- `updateConversationState`: aceptar `flow_step` como parámetro explícito
- Agregar validación: `flow_step` debe ser 1-4 para `booking_wizard`
- Agregar validación: `flow_step` debe ser 0 para `none`

---

## FASE 5 — Integrar en el Flow YAML

### 5.1 Modificar `f/flows/telegram_webhook__flow/flow.yaml`

El flow actual ya tiene las piezas. Solo necesita:

1. El `telegram_router` ahora maneja la FSM internamente
2. El `conversation_update` recibe `flow_step` del router
3. El `send_telegram_response` usa la respuesta del router

### 5.2 Cambios en input_transforms

| Módulo | Cambio |
|---|---|
| `telegram_router` | AGREGAR: `conversation_state` input |
| `conversation_update` | AGREGAR: `flow_step` input del router |

---

## FASE 6 — Tests

### 6.1 Tests unitarios de la FSM

**Archivo:** `f/internal/booking_fsm/machine.test.ts`

- 20+ tests cubriendo todas las transiciones
- Tests de transiciones inválidas (deben rechazar)
- Tests de inputs inválidos (texto en paso numérico)

### 6.2 Tests de integración del wizard

**Archivo:** `f/internal/telegram_router/wizard-integration.test.ts`

- Flujo completo: /start → 1 → specialty → 1 → doctor → 1 → time → sí → booking
- Tests de "volver" en cada paso
- Tests de input inválido en cada paso
- Tests de timeout (estado expirado)

### 6.3 Tests en el Bubble

**Archivo:** `f/internal/telegram_bubble/wizard-bubble.test.ts`

- Simular conversación completa desde el Bubble
- Verificar que cada paso genera la respuesta correcta

---

## FASE 7 — Validación Final

### 7.1 TSC

```bash
npx tsc --noEmit
# Expected: CLEAN
```

### 7.2 Tests

```bash
npx vitest run
# Expected: 280+ passed, 0 failed
```

### 7.3 Manual test con Bubble

```bash
# Secuencia completa
npx tsx f/internal/telegram_bubble/main.ts "/start"
npx tsx f/internal/telegram_bubble/main.ts "1"          # specialty
npx tsx f/internal/telegram_bubble/main.ts "1"          # doctor
npx tsx f/internal/telegram_bubble/main.ts "1"          # time
npx tsx f/internal/telegram_bubble/main.ts "sí"         # confirm
# Expected: No LOOP, cada paso avanza correctamente
```

---

## Tracklist de Implementación

```
FASE 0: Contexto y Diagnóstico          [✅ COMPLETADO]
FASE 1: Definir FSM del Wizard          [⬜ PENDIENTE]
  ├── 1.1 Crear f/internal/booking_fsm/types.ts          [⬜]
  ├── 1.2 Crear f/internal/booking_fsm/machine.ts        [⬜]
  ├── 1.3 Crear f/internal/booking_fsm/responses.ts      [⬜]
  └── 1.4 Crear f/internal/booking_fsm/index.ts          [⬜]
FASE 2: Scripts de consulta de datos    [⬜ PENDIENTE]
  ├── 2.1 Crear f/internal/booking_fsm/data-specialties.ts  [⬜]
  ├── 2.2 Crear f/internal/booking_fsm/data-doctors.ts      [⬜]
  └── 2.3 Crear f/internal/booking_fsm/data-slots.ts        [⬜]
FASE 3: Integrar FSM en el Router       [⬜ PENDIENTE]
  ├── 3.1 Crear f/internal/telegram_router/booking-wizard.ts  [⬜]
  └── 3.2 Modificar f/internal/telegram_router/main.ts        [⬜]
FASE 4: Actualizar conversation_update  [⬜ PENDIENTE]
  ├── 4.1 Modificar f/internal/conversation_update/main.ts    [⬜]
  └── 4.2 Modificar f/internal/conversation-state/index.ts    [⬜]
FASE 5: Integrar en Flow YAML           [⬜ PENDIENTE]
  └── 5.1 Modificar f/flows/telegram_webhook__flow/flow.yaml  [⬜]
FASE 6: Tests                           [⬜ PENDIENTE]
  ├── 6.1 Crear f/internal/booking_fsm/machine.test.ts        [⬜]
  ├── 6.2 Crear f/internal/telegram_router/wizard-integration.test.ts  [⬜]
  └── 6.3 Crear f/internal/telegram_bubble/wizard-bubble.test.ts     [⬜]
FASE 7: Validación Final                [⬜ PENDIENTE]
  ├── 7.1 TSC: CLEAN                                        [⬜]
  ├── 7.2 Tests: 280+ passed                                [⬜]
  └── 7.3 Manual test con Bubble                            [⬜]
```

**Total de tareas:** 17
**Archivos nuevos:** 9
**Archivos modificados:** 4
**Estimación:** 17 tareas secuenciales (cada una depende de la anterior)

---

## Dependencias entre fases

```
Fase 1 ──→ Fase 2 ──→ Fase 3 ──→ Fase 4 ──→ Fase 5 ──→ Fase 6 ──→ Fase 7
   │          │          │          │          │          │          │
   └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
                    Las fases 6-7 dependen de todo lo anterior
```
