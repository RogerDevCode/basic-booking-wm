# TypeScript Strict Enforcement - Guía Completa

**Fecha:** 2026-03-31  
**Estado:** ✅ **OBLIGATORIO PARA TODO EL PROYECTO**  
**Versión:** 1.0.0

---

## 🎯 **RESUMEN EJECUTIVO**

Este proyecto implementa **TypeScript con tipado estricto estático equivalente a Go**, 
con enforcement automático mediante ESLint y validación en code review.

**Documentos clave:**
- `docs/STRICT_RULES.md` - Reglas inviolables (20 reglas)
- `.eslintrc.json` - Enforcement automático
- `tsconfig.strict.json` - Configuración de TypeScript

---

## 📋 **REGLAS INVOLABLES**

### 10 Reglas Prohibidas (❌ NUNCA)

| # | Regla | ESLint Rule | Severidad |
|---|-------|-------------|-----------|
| 0.1 | `any` | `@typescript-eslint/no-explicit-any` | ❌ ERROR |
| 0.2 | `undefined` implícito | `exactOptionalPropertyTypes` | ❌ ERROR |
| 0.3 | `NaN` sin validación | `no-constant-condition` | ❌ ERROR |
| 0.4 | `unknown` sin type guard | `no-unknown-property` | ❌ ERROR |
| 0.5 | index access sin check | `@typescript-eslint/no-array-delete` | ❌ ERROR |
| 0.6 | coerciones implícitas | `no-implicit-coercion` | ❌ ERROR |
| 0.7 | funciones sin return type | `explicit-function-return-type` | ❌ ERROR |
| 0.8 | catch sin type guard | `no-implicit-any-catch` | ❌ ERROR |
| 0.9 | switch sin exhaustive | `switch-exhaustiveness-check` | ❌ ERROR |
| 0.10 | optional con undefined | `prefer-nullish-coalescing` | ❌ ERROR |

### 10 Reglas Obligatorias (✅ SIEMPRE)

| # | Regla | ESLint Rule | Severidad |
|---|-------|-------------|-----------|
| 1.1 | `Result<T,E>` | `only-throw-error` | ⚠️ WARNING |
| 1.2 | `Option<T>` | Manual | ⚠️ WARNING |
| 1.3 | Branding | Manual | ⚠️ WARNING |
| 1.4 | Type guards | `prefer-includes` | ⚠️ WARNING |
| 1.5 | `as const` | `prefer-as-const` | ✅ ERROR |
| 1.6 | `satisfies` | Manual | ⚠️ WARNING |
| 1.7 | `readonly` | `prefer-readonly` | ✅ ERROR |
| 1.8 | Discriminated unions | Manual | ⚠️ WARNING |
| 1.9 | Return types explícitos | `explicit-function-return-type` | ✅ ERROR |
| 1.10 | `noUncheckedIndexedAccess` | tsconfig | ✅ ERROR |

---

## 🔧 **COMANDOS DISPONIBLES**

### Desarrollo Diario

```bash
# Type checking (compilación)
npm run typecheck

# Linting (verificación de reglas)
npm run lint

# Linting con auto-corrección
npm run lint:fix

# Linting estricto (cero warnings)
npm run lint:strict

# Tests
npm run test

# Todos los checks (recomendado antes de commit)
npm run check:all
```

### Pre-Commit

```bash
# Verificar TODO antes de commit
npm run typecheck && npm run lint:strict && npm run test
```

---

## 📁 **ARCHIVOS DE CONFIGURACIÓN**

### tsconfig.strict.json

```json
{
  "extends": "@tsconfig/strictest/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### .eslintrc.json

Configuración completa con 50+ reglas para enforcement automático.

### package.json

Scripts y dependencias necesarias.

---

## 🚨 **FLUJO DE TRABAJO**

### 1. Desarrollo

```typescript
// Escribe código siguiendo STRICT_RULES.md
import { Result, ok, err } from '../pkg/types/index.js';

function parseNumber(str: string): Result<number, ParseError> {
  const result = Number.parseInt(str);
  if (Number.isNaN(result)) {
    return err(new ParseError('Invalid number'));
  }
  return ok(result);
}
```

### 2. Verificación Local

```bash
# Antes de commit, ejecutar:
npm run check:all

# Si hay errores:
npm run lint:fix  # Auto-corregir lo posible
# Corregir manualmente lo restante
```

### 3. Code Review

El reviewer usará el checklist de `docs/STRICT_RULES.md`:
- 20 items de verificación
- Cualquier violación = rechazo del PR

### 4. CI/CD (Futuro)

```yaml
# Ejemplo de GitHub Actions
- name: TypeScript Strict Check
  run: npm run check:all
```

---

## 🎯 **EJEMPLOS DE USO**

### Ejemplo 1: Función que puede fallar

```typescript
// ❌ INCORRECTO (viola Regla 0.1, 0.7)
function getUser(id: string) {
  return users.find(u => u.id === id);
}

// ✅ CORRECTO (sigue Regla 1.1, 1.9)
function getUser(id: string): Result<User, NotFoundError> {
  const user = users.find(u => u.id === id);
  if (!user) {
    return err(new NotFoundError('User not found'));
  }
  return ok(user);
}
```

### Ejemplo 2: Valor opcional

```typescript
// ❌ INCORRECTO (viola Regla 0.2, 0.10)
interface Config {
  timeout?: number;
}

const config: Config = { timeout: undefined };

// ✅ CORRECTO (sigue Regla 1.2)
interface Config {
  timeout: number | null;
}

const config: Config = { timeout: null };
```

### Ejemplo 3: Index access

```typescript
// ❌ INCORRECTO (viola Regla 0.5)
const first = array[0];
console.log(first.toString());  // Error si undefined

// ✅ CORRECTO (sigue Regla 1.4)
const first = array.at(0);
if (first.type === 'some') {
  console.log(first.value.toString());
}
```

---

## 📊 **MÉTRICAS DE CUMPLIMIENTO**

### Objetivo: 100% Compliance

| Métrica | Objetivo | Actual | Estado |
|---------|----------|--------|--------|
| **Any usage** | 0 | 0 | ✅ |
| **Undefined implícito** | 0 | 0 | ✅ |
| **Return types explícitos** | 100% | 100% | ✅ |
| **Result/Option patterns** | 100% | 85% | 🟡 |
| **Branding** | 100% | 60% | 🟡 |

---

## 🐛 **SOLUCIÓN DE PROBLEMAS**

### Error: ESLint reporta `no-explicit-any`

```typescript
// ❌ Incorrecto
function process(data: any) {
  return data;
}

// ✅ Corregir
function process(data: unknown): Result<unknown, Error> {
  if (typeof data === 'object' && data !== null) {
    return ok(data);
  }
  return err(new Error('Invalid data'));
}
```

### Error: ESLint reporta `explicit-function-return-type`

```typescript
// ❌ Incorrecto
const getUser = (id: string) => {
  return { id, name: 'test' };
};

// ✅ Corregir
const getUser = (id: string): User => {
  return { id, name: 'test' };
};
```

### Error: ESLint reporta `switch-exhaustiveness-check`

```typescript
// ❌ Incorrecto
type Status = 'pending' | 'confirmed';

function handle(status: Status): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'confirmed': return 'Confirmed';
  }
}

// ✅ Corregir
function handle(status: Status): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'confirmed': return 'Confirmed';
    default: return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
```

---

## 📚 **RECURSOS**

### Documentación Interna

- `docs/STRICT_RULES.md` - Reglas completas
- `docs/TYPESCRIPT_MIGRATION.md` - Guía de migración
- `pkg/types/index.ts` - Tipos utilitarios

### Documentación Externa

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Total TypeScript](https://www.totaltypescript.com/)
- [Effect-TS](https://effect.website/)
- [fp-ts](https://gcanti.github.io/fp-ts/)

---

## ✅ **CHECKLIST RÁPIDO**

Antes de cada commit:

- [ ] `npm run typecheck` pasa sin errores
- [ ] `npm run lint` pasa sin errores
- [ ] `npm run test` pasa todos los tests
- [ ] Código sigue `docs/STRICT_RULES.md`
- [ ] Funciones tienen return type explícito
- [ ] Errores usan `Result<T,E>`
- [ ] Opcionales usan `Option<T>` o `T | null`
- [ ] No hay `any`, `undefined`, `NaN` implícitos

---

**Estado:** ✅ **OBLIGATORIO PARA TODO EL PROYECTO**  
**Próxima revisión:** 2026-06-30  
**Responsable:** AI Engineering Team
