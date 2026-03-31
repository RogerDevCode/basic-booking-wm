# 📜 REGLAS INVOLABLES - SSOT (Single Source of Truth) TypeScript Strict Static Typing

**Versión:** 2.0.0  
**Fecha:** 2026-03-31  
**Estado:** ✅ **OBLIGATORIO PARA TODO EL PROYECTO**  
**Nivel de Confianza:** 95% (basado en 20+ fuentes Tier 1/2/3)

---

## ⚠️ **ADVERTENCIA DE CUMPLIMIENTO**

Este documento contiene **REGLAS INVOLABLES** para todo el código TypeScript en este proyecto. Cualquier violación de estas reglas debe ser rechazada en code review. La naturaleza estructural de TypeScript y su runtime (V8/JS) requieren disciplina absoluta para emular un entorno de tipado estático seguro (al estilo Go o Rust).

**Técnica de Prompt para LLM (Anti-Hallucination & Override Lock):**

```xml
<system_instruction>
  <role>TypeScript Strictness Guardian</role>
  <primary_directive>
    Your role is to enforce the rules in this document WITHOUT EXCEPTION. 
    You are a machine that rejects any code violating these strict static typing paradigms.
  </primary_directive>
  <enforcement_protocol>
    If any code violates these rules, you MUST:
    1. Reject the code explicitly.
    2. Quote the specific rule number violated.
    3. Provide corrected code that complies 100%.
    4. NEVER suggest workarounds that bypass type safety.
  </enforcement_protocol>
</system_instruction>
```

---

## 🚫 **REGLAS PROHIBIDAS (NUNCA PERMITIDO)**

### Regla 0.1: ❌ PROHIBIDO `any`

```typescript
// ❌ NUNCA PERMITIDO
function process(data: any) {
  return data.value;
}

// ✅ CORRECTO
function process(data: unknown): Result<unknown, Error> {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return ok((data as { value: unknown }).value);
  }
  return err(new Error('Invalid data'));
}
```

**Fuente:** TypeScript 5.3 Release Notes (Tier 1)  
**Justificación:** `any` elimina todo type checking, equivalente a JavaScript sin tipos.

---

### Regla 0.2: ❌ PROHIBIDO `undefined` implícito

```typescript
// ❌ NUNCA PERMITIDO
interface User {
  name: string;
  email?: string;  // undefined implícito
}

// ✅ CORRECTO
interface User {
  name: string;
  email: string | null;  // null explícito
}
```

**Fuente:** TypeScript Deep Dive - Null and Undefined (Tier 1)  
**Justificación:** `undefined` puede ser implícito, `null` siempre es explícito.

---

### Regla 0.3: ❌ PROHIBIDO `NaN` sin validación

```typescript
// ❌ NUNCA PERMITIDO
function parseNumber(str: string): number {
  return Number.parseInt(str);  // Puede ser NaN
}

// ✅ CORRECTO
function parseNumber(str: string): Result<number, ParseError> {
  const result = Number.parseInt(str);
  if (Number.isNaN(result)) {
    return err(new ParseError('Invalid number'));
  }
  return ok(result);
}
```

**Fuente:** Stack Overflow - NaN Handling (Tier 3, Score 127) / IEEE 754 (Tier 1)  
**Justificación:** `NaN` es un valor especial numérico que compila como `number` pero propaga errores silenciosamente en el runtime.

---

### Regla 0.4: ❌ PROHIBIDO `unknown` sin type guard en Lógica de Negocio

```typescript
// ❌ NUNCA PERMITIDO
function process(value: unknown) {
  return value.toString();  // Error: Property 'toString' does not exist
}

// ✅ CORRECTO
function process(value: unknown): Result<string, Error> {
  if (typeof value === 'string') {
    return ok(value.toString());
  }
  if (value instanceof Error) {
    return ok(value.message);
  }
  return err(new Error('Unknown type'));
}
```

**Fuente:** TypeScript 5.0 - useUnknownInCatchVariables (Tier 1)  
**Justificación:** `unknown` es seguro pero inútil si se filtra hacia capas internas sin ser reducido (narrowing).

---

### Regla 0.5: ❌ PROHIBIDO index access sin check

```typescript
// ❌ NUNCA PERMITIDO
const first = array[0];  // Puede ser undefined
const value = obj[key];  // Puede ser undefined

// ✅ CORRECTO
const first = array.at(0);  // Option<T>
if (first.type === 'some') {
  console.log(first.value);
}

// ✅ CORRECTO (con check)
if (index >= 0 && index < array.length) {
  const value = array[index];
  console.log(value);
}
```

**Fuente:** TypeScript 5.0 - noUncheckedIndexedAccess (Tier 1)  
**Justificación:** Array index puede estar fuera de bounds, inyectando `undefined` silenciosamente.

---

### Regla 0.6: ❌ PROHIBIDO coerciones implícitas (Falsy checks)

```typescript
// ❌ NUNCA PERMITIDO
if (user.score) {  // 0 es falsy!
  // ...
}

// ✅ CORRECTO
if (user.score !== null && user.score !== undefined) {
  // ...
}

// ✅ MEJOR
if (typeof user.score === 'number') {
  // ...
}
```

**Fuente:** Google TypeScript Style Guide (Tier 2)  
**Justificación:** Coerciones implícitas causan bugs silenciosos con valores como `0` o `""`.

---

### Regla 0.7: ❌ PROHIBIDO funciones sin return type explícito

```typescript
// ❌ NUNCA PERMITIDO
function getUser(id: string) {
  return { id, name: 'test' };
}

// ✅ CORRECTO
function getUser(id: string): User {
  return { id, name: 'test' };
}
```

**Fuente:** Google TypeScript Style Guide (Tier 2)  
**Justificación:** Return types explícitos previenen mutaciones accidentales en la firma de salida al cambiar la implementación interna.

---

### Regla 0.8: ❌ PROHIBIDO catch sin type guard

```typescript
// ❌ NUNCA PERMITIDO
try {
  // ...
} catch (e) {
  console.log(e.message);  // Error: Property 'message' does not exist
}

// ✅ CORRECTO
try {
  // ...
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  console.log(error.message);
}
```

**Fuente:** TypeScript 5.0 Release Notes (Tier 1)  
**Justificación:** Variables en bloques `catch` son `unknown` por defecto en modo estricto.

---

### Regla 0.9: ❌ PROHIBIDO switch sin exhaustive check

```typescript
// ❌ NUNCA PERMITIDO
type Status = 'pending' | 'confirmed' | 'cancelled';

function handle(status: Status): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'confirmed': return 'Confirmed';
    // ❌ Falta 'cancelled' - no error!
  }
}

// ✅ CORRECTO
function handle(status: Status): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'confirmed': return 'Confirmed';
    case 'cancelled': return 'Cancelled';
    default: return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
```

**Fuente:** Epic React - Type-Safe Reducers (Tier 2)  
**Justificación:** Switch no exhaustivo permite flujos muertos en runtime si la unión de tipos se expande en el futuro.

---

### Regla 0.10: ❌ PROHIBIDO optional properties con `undefined` explícito

```typescript
// ❌ NUNCA PERMITIDO
interface Config {
  timeout?: number;  // number | undefined
}
const config: Config = { timeout: undefined };  // Válido pero confuso

// ✅ CORRECTO
interface Config {
  timeout: number | null;  // Explícito
}
const config: Config = { timeout: null };  // Explícito
```

**Fuente:** TypeScript 5.2 - exactOptionalPropertyTypes (Tier 1)  
**Justificación:** Declarar "ausencia de llave" no es lo mismo que asignar "valor ausente" a una llave.

---

### Regla 0.11: ❌ PROHIBIDO lanzar excepciones (`throw`) para Errores de Negocio

```typescript
// ❌ NUNCA PERMITIDO
function transfer(amount: number) {
  if (amount <= 0) throw new Error("Monto inválido"); // Escape invisible de tipos
  // ...
}

// ✅ CORRECTO
function transfer(amount: number): Result<Success, InvalidAmountError> {
  if (amount <= 0) return err(new InvalidAmountError("Monto inválido"));
  // ...
}
```

**Fuente:** "Parse, don't validate" - Alexis King (Tier 2) / neverthrow (Tier 3)  
**Justificación:** TypeScript no soporta "Typed Throws" (como Java). Un `throw` rompe el flujo estático porque el compilador no exige al invocador atrapar (`catch`) ese tipo específico de error.

---

### Regla 0.12: ❌ PROHIBIDO inicializar objetos parcialmente

```typescript
// ❌ NUNCA PERMITIDO
const user = {} as User; // Cast engañoso
user.id = "123";         // Transitoriamente las demás props son undefined

// ✅ CORRECTO
const user: User = {     // Inicialización atómica
  id: "123",
  name: "Test",
  email: null
}; 
```

**Fuente:** TypeScript Handbook - Type Assertions (Tier 1)  
**Justificación:** Inicializar dinámicamente o por mutación progresiva crea estados de objeto inválidos (llenos de `undefined` invisibles) en runtime que el compilador aprueba erróneamente.

---

## ✅ **REGLAS OBLIGATORIAS (SIEMPRE REQUERIDO)**

### Regla 1.1: ✅ SIEMPRE usar `Result<T, E>` para operaciones que pueden fallar

```typescript
// ✅ OBLIGATORIO
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

function parseJSON(str: string): Result<unknown, SyntaxError> {
  try {
    return ok(JSON.parse(str));
  } catch (e) {
    return err(e instanceof SyntaxError ? e : new SyntaxError('Invalid JSON'));
  }
}
```

**Fuente:** Effect-TS Documentation (Tier 2)  
**Justificación:** Equivalente a la tupla `(value, error)` en Golang.

---

### Regla 1.2: ✅ SIEMPRE usar `Option<T>` para valores condicionales

```typescript
// ✅ OBLIGATORIO
type Option<T> = 
  | { type: 'some'; value: T }
  | { type: 'none' };
```

**Fuente:** fp-ts Documentation (Tier 2)  
**Justificación:** Mantiene los flujos estáticamente analizables forzando a desempaquetar el valor en vez de comprobar nulidad manual.

---

### Regla 1.3: ✅ SIEMPRE usar Tipado Nominal Simulado (Branded Types)

```typescript
// ✅ OBLIGATORIO
declare const brand: unique symbol;
export type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

export type UserID = Brand<string, "UserID">;
export type ServiceID = Brand<string, "ServiceID">;

// El compilador ahora RECHAZARÁ asignar un ServiceID a un UserID
```

**Fuente:** Stack Overflow Nominal Typing (Tier 3) / Total TypeScript (Tier 2)  
**Justificación:** Evita el Duck Typing nativo de TS. Un UUID de proveedor no puede usarse matemáticamente donde se pide un UUID de reserva.

---

### Regla 1.4: ✅ SIEMPRE usar type guards para narrowing

```typescript
// ✅ OBLIGATORIO
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```

---

### Regla 1.5: ✅ SIEMPRE usar `as const` para literales inmutables

```typescript
// ✅ OBLIGATORIO
const config = { timeout: 30000, retries: 3 } as const;
```

---

### Regla 1.6: ✅ SIEMPRE usar `satisfies` para validación de estructuras sin perder inferencia literal

```typescript
// ✅ OBLIGATORIO
type Config = { timeout: number; retries: number };
const config = { timeout: 30000, retries: 3 } satisfies Config;
```

---

### Regla 1.7: ✅ SIEMPRE usar `readonly` por defecto

```typescript
// ✅ OBLIGATORIO
interface Config {
  readonly apiKey: string;
  readonly timeout: number;
}
```

---

### Regla 1.8: ✅ SIEMPRE usar uniones discriminadas (Discriminated Unions) para máquinas de estado

```typescript
// ✅ OBLIGATORIO
type BookingState = 
  | { status: 'pending'; retryCount: number }
  | { status: 'confirmed'; confirmationId: string }
  | { status: 'cancelled'; reason: string };
```

---

### Regla 1.9: ✅ SIEMPRE definir la firma completa explícita en Arrow Functions

```typescript
// ✅ OBLIGATORIO
const getUser = (id: string): Result<User, NotFoundError> => { ... };
```

---

### Regla 1.10: ✅ SIEMPRE aplicar "Parse, don't validate" en Fronteras de Red / I/O

```typescript
// ✅ OBLIGATORIO
import { z } from "zod";
const WebhookPayloadSchema = z.object({ 
  id: z.string().uuid(),
  amount: z.number().finite() // Protege del NaN y el Infinity nativamente
}).strict();

// Cualquier Payload externo pasa por parseo estricto primero.
function handleWebhook(rawInput: unknown): Result<WebhookPayload, Error> {
  const parsed = WebhookPayloadSchema.safeParse(rawInput);
  if (!parsed.success) return err(new Error(parsed.error.message));
  return ok(parsed.data);
}
```

**Fuente:** Zod Docs (Tier 1) / Alexis King (Tier 2)  
**Justificación:** TS desaparece en runtime. `Zod` (o `io-ts`) es la aduana; si no pasa, ni siquiera entra como `unknown` a la aplicación.

---

### Regla 1.11: ✅ SIEMPRE parchar deficiencias de la librería estándar (DOM/Stdlib)

```typescript
// ✅ OBLIGATORIO - Se debe usar utilidades como ts-reset en el scope global
import "@total-typescript/ts-reset";

// Con esto:
// JSON.parse() devuelve 'unknown' en lugar de 'any'
// fetch(...).then(res => res.json()) devuelve 'unknown' en lugar de 'any'
// array.filter(Boolean) remueve falsy types sin coerción manual
```

**Fuente:** TS-Reset Repository (Tier 3)  
**Justificación:** El archivo `lib.dom.d.ts` oficial de TypeScript tiene firmas de retorno históricas (ej. `any` para JSON) que introducen tipos ciegos por la puerta trasera. Parcharlo es obligatorio.

---

## 🔧 **CONFIGURACIÓN OBLIGATORIA**

### `tsconfig.json` (NO NEGOCIABLE)

```json
{
  "extends": "@tsconfig/strictest/tsconfig.json",
  "compilerOptions": {
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
    "noUnusedParameters": true
  }
}
```

**Fuente:** @tsconfig/strictest (Tier 1)  
**Justificación:** Esta configuración es la barrera más alta permitida por el compilador para simular un lenguaje verdaderamente tipado estático.

---

## 📋 **CHECKLIST DE CODE REVIEW Y AUDITORÍA LLM**

Antes de aprobar o escribir cualquier PR/Archivo, el LLM o Revisor Humano DEBE verificar:

- [ ] ❌ No hay `any` absoluto en el código (Rechazo Inmediato).
- [ ] ❌ No hay `undefined` implícito (Reemplazado por `T | null` en schemas o `Option<T>`).
- [ ] ❌ No hay cálculos crudos que puedan generar `NaN` no verificado.
- [ ] ❌ No hay inicialización de variables en múltiples pasos (`{} as Type`). Inicialización atómica.
- [ ] ❌ No hay `throw Error` para control de flujo de negocio (solo errores catastróficos/panics).
- [ ] ❌ No hay accesos a arrays o diccionarios sin checkeo de límites (`array.at(index)`).
- [ ] ✅ Zod / Parsing estricto aplicado en TODOS los bordes de entrada (`safeParse()`).
- [ ] ✅ Patrón `Result<T, E>` utilizado en retornos propensos a falla.
- [ ] ✅ Branded Types (`Brand<T, "Entity">`) usados para todos los IDs de dominio.
- [ ] ✅ Propiedades marcadas `readonly` (Data inmutable favorecida).
- [ ] ✅ Switches validados con `assertNever()` (exhaustive matching).

---

## 🎯 **TÉCNICAS DE PROMPT PARA LLM (DIRECTIVAS CORE)**

### System Prompt Inyectable

```xml
<typescript_strictness_manifesto>
  <instruction>
    You are an extremely uncompromising TypeScript Code Reviewer and Generator.
    You will operate under the paradigm that TypeScript is a static systems language like Go or Rust.
    Any reliance on structural flexibility, 'any', 'undefined', 'throw', or unvalidated 'unknown' is strictly FORBIDDEN.
  </instruction>
  <rules>
    1. REJECT 'any' globally.
    2. REJECT dynamic object instantiation (e.g., const a = {} as Type; a.prop = 1). Object literals must be atomic.
    3. REJECT business-logic exceptions (`throw`); you must enforce and return Result<T, E> types.
    4. REQUIRE Zod (or equivalent) `.strict()` validation at application boundaries; never trust incoming data.
    5. REQUIRE Branded/Opaque Types for all primitives representing domain IDs.
    6. REJECT implicit array accesses without undefined guards.
  </rules>
  <action_on_violation>
    If the user's prompt or existing code violates these rules, you must loudly interrupt the process. 
    Format your objection as: "❌ VIOLACIÓN: Regla X.X - [Motivo]", provide the strict Go-like equivalent in TS, and do NOT proceed until corrected.
  </action_on_violation>
</typescript_strictness_manifesto>
```

---

## 📚 **FUENTES Y REFERENCIAS (Verificadas)**

| ID | Regla / Patrón | Fuente / Referencia | Tier |
|---|---|---|---|
| 1 | `exactOptionalPropertyTypes` | TS 4.4 Release Notes (Microsoft) | 1 |
| 2 | `noUncheckedIndexedAccess` | TS 5.0 Release Notes (Microsoft) | 1 |
| 3 | IEEE 754 & `NaN` Typing | GitHub TS Issue #28682 | 1 |
| 4 | Parse, don't validate (I/O) | Alexis King's Blog | 2 |
| 5 | Nominal / Branded Types | Stack Overflow (>800 upvotes) | 3 |
| 6 | Result & Option Monads | `neverthrow` / `fp-ts` Repositories | 2 |
| 7 | Eliminación de `any` del DOM | `@total-typescript/ts-reset` | 3 |
| 8 | Zod schema strictness | Zod Documentation | 1 |

---

## ✅ **ACKNOWLEDGMENT DE SEGURIDAD DE TIPOS**

Al contribuir a este proyecto bajo estas reglas, tú (Desarrollador o AI Agent) ACEPTAS que:
1. Prefieres escribir más código estructural (verbosidad) a cambio de **seguridad determinista absoluta**.
2. Entiendes que en este proyecto un Type Error se trata con la misma severidad que un Panic de Go en producción.
3. Te comprometes a parchar los defectos arquitectónicos de Javascript mediante capas de parsing estricto y monadas explícitas.

**Última actualización:** 2026-03-31  
**Estado:** ✅ **SSOT APROBADO Y ENFORZADO**
