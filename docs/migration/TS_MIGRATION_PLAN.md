# 🚀 Plan Estricto de Migración: Golang a TypeScript (Windmill + SSOT Strict Typing)

**Fecha:** 2026-03-31
**Objetivo:** Migrar el 100% del backend de *Booking Titanium* (escrito en Golang) a TypeScript estricto en Windmill, adoptando las reglas inquebrantables de `@docs/SSOT_STRICT_RULES.md`.

---

## 🏛️ Fase 1: Preparación del Entorno y Manifiesto (Día 1-2)

### 1.1 Configuración del Runtime (Bun)
Windmill soporta Bun, que es ideal para esta migración por su velocidad y compatibilidad nativa con TypeScript.
1. Inicializar `package.json` en la raíz del proyecto.
2. Instalar dependencias base exigidas por el manifiesto:
   ```bash
   bun add zod neverthrow @total-typescript/ts-reset
   bun add -d typescript @types/node
   ```

### 1.2 Establecer el `tsconfig.json` Inviolable
Crear el archivo en la raíz que fuerce a todo el proyecto a cumplir las reglas estructurales.

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["bun-types"]
  }
}
```

### 1.3 Archivo Central de Tipos (Domain Primitives)
Crear `internal/types/domain.ts` para establecer los "Branded Types" que reemplazarán a los UUIDs planos de Go.

```typescript
// internal/types/domain.ts
import { z } from "zod";

declare const brand: unique symbol;
export type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

export type ProviderID = Brand<string, "ProviderID">;
export type PatientID = Brand<string, "PatientID">;
export type BookingID = Brand<string, "BookingID">;

// Result Pattern Base
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export const ok = <T>(data: T): Result<T, never> => ({ success: true, data });
export const err = <E>(error: E): Result<never, E> => ({ success: false, error });
```

---

## 🏗️ Fase 2: Migración de Core y Dominio (Día 3-5)

### 2.1 Zod Schemas como Frontera (Parse, don't validate)
Todo struct de Go usado para recibir datos (HTTP, Webhooks) debe convertirse en un Zod Schema con `.strict()`.

*Ejemplo de migración de `booking_create`:*
```typescript
import { z } from "zod";
import { ProviderID, PatientID } from "../types/domain";

export const CreateBookingSchema = z.object({
  providerId: z.string().uuid().transform(val => val as ProviderID),
  patientId: z.string().uuid().transform(val => val as PatientID),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  serviceId: z.string().uuid()
}).strict();

export type CreateBookingPayload = z.infer<typeof CreateBookingSchema>;
```

### 2.2 Reescritura de Utilidades sin Excepciones
Migrar funciones como parseo de fechas, zonas horarias, y helpers. Ninguna utilidad debe usar `throw`. Todas deben retornar `Result<T, Error>`.

---

## 🔄 Fase 3: Migración de Scripts Windmill (Día 6-10)

Cada script en `/f/` (actualmente `.go`) se convertirá en un `.ts`. 
Windmill requiere exportar la función `main`.

**Regla crítica aplicada a Windmill:** El parámetro inyectado por Windmill DEBE ser `unknown`, parseado en la línea 1.

*Estructura del nuevo script Windmill `f/booking_create/main.ts`:*
```typescript
import "@total-typescript/ts-reset";
import { CreateBookingSchema, CreateBookingPayload } from "../../internal/schemas";
import { Result, ok, err } from "../../internal/types/domain";

export async function main(rawPayload: unknown, dbResource: unknown): Promise<Result<string, Error>> {
  // 1. Zod Parsing (Frontera)
  const parsed = CreateBookingSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return err(new Error(`Invalid input: ${parsed.error.message}`));
  }
  
  const payload: CreateBookingPayload = parsed.data;

  // 2. Lógica de Negocio Tipada
  const txResult = await executeTransaction(dbResource, payload);
  if (!txResult.success) {
      return err(txResult.error); // Retorno explícito, sin throw
  }

  return ok(txResult.data.bookingId);
}
```

**Orden de Migración de Scripts:**
1. RAG y AI Agent (`f/internal/ai_agent`, `f/availability_smart_search`) -> *Prioridad alta al ser dependientes de JSON/LLMs.*
2. Notificaciones (`gmail_send`, `telegram_send`).
3. Core Transaccional (`booking_create`, `booking_cancel`).
4. Sincronización GCal (`gcal_create_event`).

---

## 🧪 Fase 4: Migración Extrema de Tests (Día 11-14)

Los tests de Go (`*_test.go`) deben reescribirse en TS utilizando el runner de `bun test` o `jest`.

### 4.1 Estrategia de Testing en TS
Dado que hemos eliminado `throw` y `any`, los tests verificarán el patrón `Result`.

```typescript
import { test, expect } from "bun:test";
import { main } from "./main";

test("debería rechazar un payload con campos faltantes", async () => {
  const badPayload = { providerId: "..." }; // Faltan campos
  
  const result = await main(badPayload, mockDb);
  
  // Verificación estática y de runtime del patrón Result
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.message).toContain("Invalid input");
  }
});
```

### 4.2 Protocolo Multi-Agente en TS
El protocolo de testing (Red Team, Devil's Advocate, etc.) se adapta:
*   **Red Team:** Inyectará `SQL Injection` y strings malformados a través del raw `unknown` input. Zod debe atrapar el 100%.
*   **Formal Verification:** Testeará que las uniones discriminadas (`BookingState`) cubran todas las transiciones posibles (evitando el bypass de estados).
*   **Edge Stressor:** Se usará `Promise.all` masivos en lugar de goroutines para probar race conditions en la BD.

---

## 🔒 Fase 5: CI/CD y Aplicación de SSOT (Día 15)

1.  **Linter Inquebrantable:** Configurar ESLint con reglas personalizadas para prohibir la palabra clave `any` a nivel AST.
2.  **Husky Pre-commit:** Ejecutar `tsc --noEmit` antes de cada commit. Si hay una falla de tipado (ej. no se verificó un índice de array), el commit se rechaza.
3.  **Actualización de Windmill:** Modificar `wmill.yaml` para cambiar todos los `language: go` a `language: bun`.

---

## ⚖️ Riesgos de la Migración y Mitigaciones

| Riesgo | Mitigación bajo SSOT |
| :--- | :--- |
| Pérdida de concurrencia ligera de Go | Uso eficiente del Event Loop de Node/Bun. Para operaciones pesadas, delegar a queries SQL o servicios externos. |
| Degradación por Excepciones silenciosas | La **Regla 0.11** prohíbe el `throw` para lógica de negocio. Uso estricto de `Result<T, E>`. |
| Tipos falsos desde Postgres | Todo retorno de la DB (`sql` o un ORM crudo) DEBE pasar por Zod de regreso a la aplicación, garantizando que el esquema TS coincida con la DB. |
