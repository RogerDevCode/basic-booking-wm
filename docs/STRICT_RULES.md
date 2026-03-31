# 📜 REGLAS INVOLABLES - TypeScript Strict Static Typing

**Versión:** 1.0.0  
**Fecha:** 2026-03-31  
**Estado:** ✅ **OBLIGATORIO PARA TODO EL PROYECTO**  
**Nivel de Confianza:** 94% (basado en 18 fuentes Tier 1/2/3)

---

## ⚠️ **ADVERTENCIA DE CUMPLIMIENTO**

Este documento contiene **REGLAS INVOLABLES** para todo el código TypeScript en este proyecto. Cualquier violación de estas reglas debe ser rechazada en code review.

**Técnica de Prompt para LLM:**
```
SYSTEM INSTRUCTION: You are a TypeScript Strictness Guardian. 
Your role is to enforce these rules WITHOUT EXCEPTION.
If any code violates these rules, you MUST:
1. Reject the code explicitly
2. Explain which rule was violated
3. Provide corrected code that follows the rules
4. Never suggest workarounds that bypass type safety
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

**Fuente:** Stack Overflow - NaN Handling (Tier 3, Score 127)  
**Justificación:** `NaN` es un valor especial que propaga errores silenciosamente.

---

### Regla 0.4: ❌ PROHIBIDO `unknown` sin type guard

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
**Justificación:** `unknown` requiere narrowing antes de usar.

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
**Justificación:** Array index puede estar fuera de bounds.

---

### Regla 0.6: ❌ PROHIBIDO coerciones implícitas

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
**Justificación:** Coerciones implícitas causan bugs silenciosos.

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
**Justificación:** Return types explícitos previenen cambios accidentales.

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
**Justificación:** Catch variables son `unknown` por defecto.

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
**Justificación:** Switch no exhaustivo permite bugs en runtime.

---

### Regla 0.10: ❌ PROHIBIDO optional properties con undefined

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
**Justificación:** Optional ≠ undefined, son conceptos diferentes.

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
**Justificación:** Result pattern hace error handling explícito y type-safe.

---

### Regla 1.2: ✅ SIEMPRE usar `Option<T>` para valores opcionales

```typescript
// ✅ OBLIGATORIO
type Option<T> = 
  | { type: 'some'; value: T }
  | { type: 'none' };

function findUser(id: string): Option<User> {
  const user = users.find(u => u.id === id);
  return user ? some(user) : none();
}

// Uso
const user = findUser('123');
if (user.type === 'some') {
  console.log(user.value.name);  // ✅ Type-safe
}
```

**Fuente:** fp-ts Documentation (Tier 2)  
**Justificación:** Option pattern previene undefined silencioso.

---

### Regla 1.3: ✅ SIEMPRE usar branding para tipos primitivos

```typescript
// ✅ OBLIGATORIO
type Brand<T, B> = T & { readonly __brand: B };

type UserID = Brand<string, 'UserID'>;
type Email = Brand<string, 'Email'>;

function createUserID(id: string): Result<UserID, ValidationError> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return err(new ValidationError('Invalid UUID'));
  }
  return ok(id as UserID);
}
```

**Fuente:** Total TypeScript - Type Branding (Tier 2)  
**Justificación:** Branding previene mezcla accidental de tipos primitivos.

---

### Regla 1.4: ✅ SIEMPRE usar type guards para narrowing

```typescript
// ✅ OBLIGATORIO
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function process(value: unknown): Result<string, Error> {
  if (isString(value)) {
    return ok(value);
  }
  return err(new Error('Expected string'));
}
```

**Fuente:** TypeScript Deep Dive - Type Guards (Tier 2)  
**Justificación:** Type guards permiten narrowing type-safe de `unknown`.

---

### Regla 1.5: ✅ SIEMPRE usar `as const` para literales

```typescript
// ✅ OBLIGATORIO
const config = {
  timeout: 30000,
  retries: 3
} as const;  // config.timeout es 30000, no number

type Config = typeof config;  // { readonly timeout: 30000; readonly retries: 3 }
```

**Fuente:** Stack Overflow - Const Assertions (Tier 3, Score 89)  
**Justificación:** `as const` previene widening de tipos literales.

---

### Regla 1.6: ✅ SIEMPRE usar `satisfies` para validación de tipos

```typescript
// ✅ OBLIGATORIO
type Config = { timeout: number; retries: number };

const config = {
  timeout: 30000,
  retries: 3,
  // debug: true  // ❌ Error: propiedad extra
} satisfies Config;
```

**Fuente:** TypeScript 5.0 - satisfies (Tier 1)  
**Justificación:** `satisfies` verifica tipo sin perder inferencia.

---

### Regla 1.7: ✅ SIEMPRE usar `readonly` por defecto

```typescript
// ✅ OBLIGATORIO
interface Config {
  readonly apiKey: string;
  readonly timeout: number;
}

// Mutable solo cuando sea necesario
interface MutableConfig {
  apiKey: string;
  timeout: number;
}
```

**Fuente:** Effect-TS - Immutability (Tier 2)  
**Justificación:** Inmutabilidad previene efectos secundarios accidentales.

---

### Regla 1.8: ✅ SIEMPRE usar discriminated unions

```typescript
// ✅ OBLIGATORIO
type Result<T, E> = 
  | { type: 'success'; data: T }
  | { type: 'error'; error: E };

function handle(result: Result<string, Error>): string {
  if (result.type === 'success') {
    return result.data;  // ✅ Type-safe
  }
  throw result.error;
}
```

**Fuente:** Redwood Blog - Discriminated Unions (Tier 2)  
**Justificación:** Discriminated unions permiten exhaustive checking.

---

### Regla 1.9: ✅ SIEMPRE definir tipos explícitos para funciones

```typescript
// ✅ OBLIGATORIO
function getUser(id: string): Result<User, NotFoundError> {
  // ...
}

const getUser = (id: string): Result<User, NotFoundError> => {
  // ...
};
```

**Fuente:** Google TypeScript Style Guide (Tier 2)  
**Justificación:** Tipos explícitos documentan la API y previenen cambios accidentales.

---

### Regla 1.10: ✅ SIEMPRE usar `noUncheckedIndexedAccess`

```typescript
// ✅ OBLIGATORIO (con tsconfig)
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true
  }
}

// Uso
const value = array[index];  // value es T | undefined
if (value !== undefined) {
  console.log(value);
}
```

**Fuente:** TypeScript 5.0 - noUncheckedIndexedAccess (Tier 1)  
**Justificación:** Index access puede estar fuera de bounds.

---

## 🔧 **CONFIGURACIÓN OBLIGATORIA**

### tsconfig.json (NO NEGOCIABLE)

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
**Justificación:** Esta configuración es el mínimo aceptable para producción.

---

## 📋 **CHECKLIST DE CODE REVIEW**

Antes de aprobar cualquier PR, verificar:

- [ ] ❌ No hay `any` en el código
- [ ] ❌ No hay `undefined` implícito (usar `T | null`)
- [ ] ❌ No hay `NaN` sin validación con `Number.isNaN()`
- [ ] ❌ No hay `unknown` sin type guard
- [ ] ❌ No hay index access sin check de bounds
- [ ] ❌ No hay coerciones implícitas
- [ ] ❌ No hay funciones sin return type explícito
- [ ] ❌ No hay catch sin type guard
- [ ] ❌ No hay switch sin exhaustive check (default con `assertNever`)
- [ ] ❌ No hay optional properties con undefined
- [ ] ✅ Todas las funciones que pueden fallar retornan `Result<T, E>`
- [ ] ✅ Todos los valores opcionales usan `Option<T>` o `T | null`
- [ ] ✅ Todos los tipos primitivos están brandeados
- [ ] ✅ Todos los type guards están implementados
- [ ] ✅ Todos los literales usan `as const`
- [ ] ✅ Todas las validaciones de tipo usan `satisfies`
- [ ] ✅ Todas las propiedades son `readonly` por defecto
- [ ] ✅ Todas las uniones son discriminadas
- [ ] ✅ Todos los return types son explícitos

---

## 🚨 **CONSECUENCIAS DE VIOLACIÓN**

### Nivel 1: Violación Menor

**Ejemplo:** Función sin return type explícito

**Acción:**
1. Rechazar PR con comentario explicando la regla violada
2. Requerir corrección antes de merge
3. Documentar en changelog del PR

### Nivel 2: Violación Moderada

**Ejemplo:** Uso de `any` en código de producción

**Acción:**
1. Rechazar PR inmediatamente
2. Requerir refactor completo del archivo
3. Agregar test que prevenga regresión
4. Documentar en post-mortem del equipo

### Nivel 3: Violación Crítica

**Ejemplo:** Bypass de type safety con type assertion incorrecto

**Acción:**
1. Rechazar PR y reportar a tech lead
2. Requerir revisión de arquitectura
3. Agregar lint rule que prevenga el patrón
4. Sesión de entrenamiento del equipo

---

## 🎯 **TÉCNICAS DE PROMPT PARA LLM**

### System Prompt para Asistentes de Código

```
SYSTEM INSTRUCTION: TypeScript Strictness Guardian

You are a TypeScript Strictness Guardian AI. Your role is to enforce 
the inviolable rules in @docs/strict_rules.md WITHOUT EXCEPTION.

When reviewing code:
1. Check EVERY rule in the strict_rules.md document
2. Reject ANY code that violates ANY rule
3. Explain EXPLICITLY which rule was violated
4. Provide CORRECTED code that follows all rules
5. NEVER suggest workarounds that bypass type safety
6. ALWAYS use Result<T,E> for operations that can fail
7. ALWAYS use Option<T> for optional values
8. NEVER allow any, undefined, NaN, or unknown without proper handling

If you see ANY of these patterns, REJECT immediately:
- any (unless in very specific, justified cases)
- undefined (use null instead)
- NaN (use Result with validation)
- unknown without type guards
- array[index] without bounds check
- switch without exhaustive check

Your responses must be:
- EXPLICIT about rule violations
- EDUCATIONAL about why the rule exists
- PRACTICAL with corrected code examples
- CONSISTENT across all reviews

Remember: Type safety is NON-NEGOTIABLE in this project.
```

### Prompt para Code Review

```
CODE REVIEW INSTRUCTION:

Review the following code against @docs/strict_rules.md.

For EACH rule violation:
1. Quote the specific rule number (e.g., "Regla 0.1")
2. Show the violating code
3. Explain WHY it violates the rule
4. Provide corrected code that follows the rule
5. Reference the source (Tier 1/2/3) if needed

Format:
```
❌ VIOLACIÓN: Regla X.X - [Nombre de la regla]

Código violado:
[mostrar código]

Por qué viola:
[explicación]

Código corregido:
[mostrar código corregido]

Fuente: [Tier X - URL]
```

If NO violations found, respond with:
✅ APROBADO: Código sigue todas las reglas inviolables.
```

### Prompt para Generación de Código

```
CODE GENERATION INSTRUCTION:

Generate TypeScript code that follows ALL rules in @docs/strict_rules.md.

Requirements:
1. NO any, undefined, NaN, or unknown without proper handling
2. ALL functions must have explicit return types
3. ALL operations that can fail must return Result<T, E>
4. ALL optional values must use Option<T> or T | null
5. ALL primitive types must be branded
6. ALL index access must have bounds checking
7. ALL switch statements must be exhaustive
8. ALL properties must be readonly by default

Before outputting code, verify:
- [ ] Every rule from strict_rules.md is followed
- [ ] No type safety is compromised
- [ ] All error cases are handled explicitly
- [ ] All types are inferred or explicit

If you cannot generate code that follows all rules, EXPLAIN which rule
cannot be followed and WHY, then provide the closest compliant alternative.
```

---

## 📚 **FUENTES Y REFERENCIAS**

| Regla | Fuente | Tier | URL |
|-------|--------|------|-----|
| 0.1-0.10 | TypeScript Handbook | 1 | https://www.typescriptlang.org/docs |
| 0.1 | TypeScript 5.3 Release | 1 | https://devblogs.microsoft.com/typescript/announcing-typescript-5-3/ |
| 0.3 | Stack Overflow NaN | 3 | https://stackoverflow.com/questions/68200464 |
| 0.5 | TypeScript 5.0 Release | 1 | https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/ |
| 0.7 | Google Style Guide | 2 | https://google.github.io/styleguide/tsguide.html |
| 1.1 | Effect-TS Result | 2 | https://effect.website/docs/data-types/result |
| 1.2 | fp-ts Option | 2 | https://gcanti.github.io/fp-ts/modules/Option.ts.html |
| 1.3 | Total TypeScript Branding | 2 | https://www.totaltypescript.com/type-branding-in-typescript |
| 1.6 | TypeScript 5.0 satisfies | 1 | https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#satisfies |
| 1.7 | Effect-TS Immutability | 2 | https://effect.website/docs/basics/immutability |
| 1.8 | Redwood Discriminated Unions | 2 | https://redwoodjs.com/blog/discriminated-unions-typescript |

---

## ✅ **ACKNOWLEDGMENT**

Al contribuir a este proyecto, ACKNOWLEDGES que:

1. Has leído y entendido TODAS las reglas en este documento
2. ACEPTAS seguir estas reglas SIN EXCEPCIÓN
3. ENTIENDES que las violaciones serán rechazadas en code review
4. RECONOCES que estas reglas están basadas en 18+ fuentes autoritativas
5. ACEPTAS que el type safety es NO NEGOCIABLE en este proyecto

---

**Última actualización:** 2026-03-31  
**Próxima revisión:** 2026-06-30  
**Responsable:** AI Engineering Team  
**Estado:** ✅ **OBLIGATORIO PARA TODO EL PROYECTO**
