# Plan v4 — TypeScript-Only Cleanup & Best Practices 2026

**Fecha:** 2026-04-02
**Origen:** Best practices comunidad TypeScript AI Agent (CallSphere, TypeScript.Page, Medium 2026)
**Estado:** Propuesta — Esperando confirmación

---

## Principios (Community Validated 2026)

1. **Zod como fuente de verdad** — No duplicar tipos TS + Zod. Usar `z.infer<typeof schema>` siempre
2. **Mock LLM en tests** — Tests unitarios NUNCA llaman a APIs reales (CallSphere pattern)
3. **Typed Prompt Engineering** — PromptSpec<Input, Output> con runtime validation (TypeScript.Page 2026)
4. **Discriminated Unions** — Para error handling exhaustivo (compiler enforce)
5. **noUncheckedIndexedAccess** — Forzar manejo de undefined en objetos/arrays
6. **Eliminar código muerto** — Si no se usa en producción, se borra. Sin excepciones.

---

## FASE 0: Eliminar Código Go Obsoleto (30 min)

### 0.1 — Borrado seguro (Tier 1: 100% safe)
| Directorio | Archivos | Líneas | Justificación |
|---|---|---|---|
| `test_chilean.go` | 1 | 11 | Scratch file, cero referencias |
| `tests/_old_conflicts/` | 7 | 1,499 | Archivos de merge conflict, obsoletos |
| `cmd/tools/` | 23 | 2,566 | Herramientas one-off, no referenciadas |
| `cmd/tools/ai_agent_redteam.go` | 1 | 406 | Marcado para eliminación en plan v3 |
| `f/internal/ai_agent/main_redteam_test.go` | 1 | 382 | Marcado para eliminación |
| `f/internal/ai_agent/main_devilsadvocate_test.go` | 1 | 481 | Marcado para eliminación |
| **Subtotal** | **34** | **5,345** | |

### 0.2 — Borrado de tests standalone Go (Tier 2: safe)
| Directorio | Archivos | Líneas | Justificación |
|---|---|---|---|
| `tests/` (standalone .go) | 14 | ~3,000 | No referenciados por Makefile/Dockerfile |
| `tests/_old_conflicts/` | 7 | 1,499 | Ya incluidos arriba |
| **Subtotal** | **14** | **~3,000** | |

### 0.3 — Borrado de f/ scripts Go sin migrar (Tier 3: verificar antes)
Estos scripts Go en `f/` NO tienen equivalente TypeScript aún:
| Script | Líneas | Estado | Acción |
|---|---|---|---|
| `f/ai_agent_production/main.go` | 251 | Obsoleto (reemplazado por f/internal/ai_agent/main.ts) | **BORRAR** |
| `f/availability_check/main.go` | 36 | Referenciado por test_windmill_scripts.sh | **MANTENER** (por ahora) |
| `f/availability_smart_search/main.go` | 763 | Sin equivalente TS | **MANTENER** |
| `f/booking_orchestrator/main.go` | 49 | Referenciado por flow.yaml | **MANTENER** |
| `f/booking_reschedule/main.go` | 31 | Referenciado por test script | **MANTENER** |
| `f/circuit_breaker_check/main.go` | 35 | Referenciado por test script | **MANTENER** |
| `f/circuit_breaker_record/main.go` | 42 | Referenciado por test script | **MANTENER** |
| `f/distributed_lock_acquire/main.go` | 40 | Referenciado por test script | **MANTENER** |
| `f/distributed_lock_acquire_single/main.go` | 40 | Sin referencias | **BORRAR** |
| `f/distributed_lock_release/main.go` | 31 | Referenciado por test script | **MANTENER** |
| `f/gcal_bidirectional_sync/main.go` | 388 | Sin equivalente TS | **MANTENER** |
| `f/gcal_cleanup_sync/main.go` | 293 | Sin equivalente TS | **MANTENER** |
| `f/gcal_delete_event/main.go` | 35 | Referenciado por test script | **MANTENER** |
| `f/gcal_sync_engine/main.go` | 188 | Sin equivalente TS | **MANTENER** |
| `f/gcal_webhook_renew/main.go` | 174 | Sin equivalente TS | **MANTENER** |
| `f/gcal_webhook_setup/main.go` | 172 | Sin equivalente TS | **MANTENER** |
| `f/get_providers/main.go` | 31 | Referenciado por test script | **MANTENER** |
| `f/get_providers_by_service/main.go` | 31 | Sin referencias | **BORRAR** |
| `f/get_services/main.go` | 31 | Referenciado por test script | **MANTENER** |
| `f/get_services_by_provider/main.go` | 31 | Sin referencias | **BORRAR** |
| `f/nn_03b_pipeline_agent/main.go` | 247 | Sin referencias | **BORRAR** |
| `f/seed_daily_provisioning/main.go` | 368 | Sin referencias | **BORRAR** |
| `f/seed_process_slot/` | 3 | 1,113 | Sin referencias | **BORRAR** |
| `f/telegram_send/main_test.go` | 109 | Sin main.ts sibling | **BORRAR** |
| `f/telegram_send_enhanced/main.go` | 148 | Sin referencias | **BORRAR** |

**Scripts Go a borrar en esta fase:** 8 archivos (~2,300 líneas)
**Scripts Go a mantener:** 16 archivos (activamente usados o sin migrar aún)

### 0.4 — Limpiar referencias en scripts y docs
| Archivo | Acción |
|---|---|
| `scripts/test_windmill_scripts.sh` | Actualizar rutas, quitar Go borrados |
| `scripts/test_single_provider_go.sh` | Eliminar (ya no hay Go que testear) |
| `scripts/test_single_provider.sh` | Eliminar referencias Go |
| `Makefile` | Eliminar targets Go (build, test) |
| `docker-compose/Dockerfile` | Eliminar o actualizar |
| `gp.sh` | Eliminar `go build ./...` |
| `docs/migration/*.md` | Marcar como históricos |
| `docs/best-practices/*-go-*.md` | Mover a `docs/best-practices/_archived/` |

### 0.5 — Eliminar go.mod y go.sum
- `go.mod` (41 líneas)
- `go.sum` (192 líneas)

**Total estimado a eliminar:** ~12,000 líneas de código Go muerto

---

## FASE 1: Typed Prompt Engineering (45 min)

### 1.1 — Crear `f/internal/ai_agent/types.ts`
```typescript
// PromptSpec pattern (TypeScript.Page 2026)
export interface IntentPromptSpec {
  name: 'intent_classifier';
  version: '1.0';
  systemPrompt: string;
  outputSchema: z.ZodType<IntentResult>;
}

// Discriminated union para resultados (CallSphere pattern)
export type IntentResult =
  | { kind: 'success'; intent: IntentType; confidence: number; entities: EntityMap; needs_more: boolean; follow_up: string | null }
  | { kind: 'llm_error'; error: string; fallback_used: boolean }
  | { kind: 'guardrail_blocked'; reason: string };

// Entity map tipada
export type EntityMap = {
  date?: string;
  time?: string;
  booking_id?: string;
  patient_name?: string;
  service_type?: string;
};
```

### 1.2 — Refactorizar `guardrails.ts` para usar discriminated unions
- Reemplazar `ValidationResult` con `IntentResult` discriminated union
- Compiler enforce exhaustividad en switch statements

### 1.3 — Crear `f/internal/ai_agent/llm-mock.ts`
```typescript
// CallSphere pattern: Mock LLM para tests determinísticos
export function createMockLLM(responses: Record<string, IntentResult>) {
  return async (systemPrompt: string, userMessage: string): Promise<IntentResult> => {
    const key = userMessage.toLowerCase().trim();
    return responses[key] ?? { kind: 'llm_error', error: 'No mock response', fallback_used: true };
  };
}
```

---

## FASE 2: Testing con Mocks LLM (30 min)

### 2.1 — Refactorizar `main.test.ts` para usar mocks
- Los tests actuales usan el fallback rules-based (funcionan sin LLM)
- Agregar tests con mock LLM para validar el path LLM
- Pattern CallSphere: `mockChatResponse()` para respuestas determinísticas

### 2.2 — Crear `f/internal/ai_agent/main.mock.test.ts`
```typescript
// Tests que simulan respuestas LLM reales
describe('AI Agent with Mocked LLM', () => {
  it('classifies create_appointment when LLM returns valid JSON', async () => {
    const mockLLM = createMockLLM({
      'quiero agendar una cita': {
        kind: 'success',
        intent: 'create_appointment',
        confidence: 0.95,
        entities: { date: 'mañana' },
        needs_more: false,
        follow_up: null,
      },
    });
    // ... test con mock inyectado
  });
});
```

### 2.3 — Snapshot tests para outputs estructurados
- `vitest --update` para actualizar snapshots cuando el comportamiento cambia intencionalmente
- Review snapshot diffs en PRs

---

## FASE 3: Zod como Single Source of Truth (30 min)

### 3.1 — Crear `f/internal/ai_agent/schemas.ts`
```typescript
// Zod schemas como fuente de verdad (CallSphere + TypeScript.Page 2026)
export const AIAgentInputSchema = z.object({
  chat_id: z.string().min(1),
  text: z.string().trim().min(1).max(500),
  user_profile: z.object({
    is_first_time: z.boolean(),
    booking_count: z.number().int().min(0),
  }).optional(),
});

export const IntentResultSchema = z.object({
  intent: z.enum(Object.values(INTENT) as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string(), z.unknown()).optional(),
  needs_more: z.boolean(),
  follow_up: z.string().max(200).nullable(),
});

// Tipos inferidos — NUNCA definir manualmente
export type AIAgentInput = z.infer<typeof AIAgentInputSchema>;
export type IntentResultType = z.infer<typeof IntentResultSchema>;
```

### 3.2 — Refactorizar `main.ts` para usar schemas
- Reemplazar `inputSchema` inline con `AIAgentInputSchema` importado
- Usar `IntentResultSchema.parse()` para validar output LLM

### 3.3 — Eliminar tipos duplicados
- `AIAgentInput` interface → reemplazar con `z.infer`
- `AIAgentEntities` interface → reemplazar con `z.infer`
- `AvailabilityContext` interface → reemplazar con `z.infer`

---

## FASE 4: tsconfig Moderno (15 min)

### 4.1 — Actualizar `tsconfig.json` con patterns 2026
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

### 4.2 — Habilitar `noUncheckedIndexedAccess`
- Esto fuerza manejar `undefined` en `obj[key]`
- Previene bugs comunes en parsing de LLM responses

---

## FASE 5: Documentación y Cleanup Final (20 min)

### 5.1 — Actualizar `docs/AI_AGENT_HANDBOOK.md`
- Agregar sección de Typed Prompt Engineering
- Documentar el patrón de Mock LLM para tests
- Referencias a best practices 2026

### 5.2 — Actualizar `docs/PLAN_AI_LLM_INTENT_V3.md`
- Marcar como completado el plan v3
- Crear enlace a este plan v4

### 5.3 — Crear `docs/TYPESCRIPT_BEST_PRACTICES.md`
- Patrones adoptados de la comunidad 2026
- Decisiones arquitectónicas con referencias

---

## Resumen de Cambios

| Fase | Archivos nuevos | Archivos modificados | Archivos borrados | Tiempo |
|---|---|---|---|---|
| 0: Cleanup Go | 0 | 6 scripts/docs | ~50 archivos Go | 30 min |
| 1: Typed Prompts | 2 (types.ts, llm-mock.ts) | 2 (guardrails, main) | 0 | 45 min |
| 2: Mock Testing | 1 (main.mock.test.ts) | 1 (main.test.ts) | 0 | 30 min |
| 3: Zod SSOT | 1 (schemas.ts) | 3 (main, guardrails, constants) | 0 | 30 min |
| 4: tsconfig | 0 | 1 (tsconfig.json) | 0 | 15 min |
| 5: Docs | 1 (TS_BEST_PRACTICES.md) | 2 (HANDBOOK, PLAN) | 0 | 20 min |
| **Total** | **5** | **15** | **~50** | **~2.8h** |

---

## Métricas Esperadas

| Métrica | Antes | Después |
|---|---|---|
| Líneas de código Go | ~29,000 | **~15,000** (solo lo activo) |
| Líneas de código TS (ai_agent) | ~800 | **~1,200** (más tipado) |
| Types duplicados | ~5 interfaces | **0** (todo z.infer) |
| Tests con mocks LLM | 0 | **~10** |
| noUncheckedIndexedAccess | false | **true** |
| Discriminated unions | 0 | **1** (IntentResult) |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Romper scripts que referencian Go borrado | Media | Actualizar scripts antes de borrar |
| Flow booking_orchestrator depende de Go | Alta | No borrar ese script, migrar después |
| GCal scripts Go sin equivalente TS | Media | Mantenerlos, migrar en fase posterior |
| Tests fallan con noUncheckedIndexedAccess | Alta | Fix types gradualmente, no todo de golpe |

---

## Orden de Ejecución

1. **FASE 0** → Borrar Go muerto (limpieza, sin riesgo funcional)
2. **FASE 1** → Typed Prompt Engineering (base sólida)
3. **FASE 3** → Zod SSOT (elimina duplicación)
4. **FASE 2** → Mock Testing (valida Fase 1)
5. **FASE 4** → tsconfig moderno (mejora type safety)
6. **FASE 5** → Documentación (cierra el ciclo)
