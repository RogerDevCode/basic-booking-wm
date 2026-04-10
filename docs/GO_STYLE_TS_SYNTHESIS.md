# 📜 Synthesis: Go-Style TypeScript Best Practices

This document synthesizes industry-standard best practices for implementing TypeScript with the rigor and determinism of the Go programming language.

---

## 1. Errors as Values (The Result Pattern)
The most fundamental "Go-style" practice is treating errors as data rather than control-flow jumps.

### ✅ The Pattern
Use a tuple `[Error | null, T | null]` for all fallible operations.

```typescript
export type Result<T> = [Error | null, T | null];

async function fetchData(): Promise<Result<Data>> {
  try {
    const data = await api.get();
    return [null, data];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### 🧠 Rationale
- **Explicit Checks:** Forces the developer to handle `if (err !== null)` before accessing data.
- **Linear Logic:** Avoids "Try-Catch-Hell" and keeps the "happy path" on the left margin.
- **Type Safety:** Eliminates `any` in error handling; errors are always `Error` or a specific subtype.

---

## 2. Nominal Typing (Branded Types)
TypeScript's structural typing can lead to "Primitive Obsession." Go-style nominal typing prevents mixing different IDs (e.g., `UserId` vs `ProviderId`).

### ✅ The Pattern (Zod Standard)
Use Zod's `.brand()` for validation-at-the-edge and nominal safety.

```typescript
import { z } from 'zod';

export const UserIdSchema = z.string().uuid().brand<'UserId'>();
export type UserId = z.infer<typeof UserIdSchema>;

// This function ONLY accepts a validated UserId
function processUser(id: UserId) { ... }
```

### 🧠 Rationale
- **Safety:** Prevents passing a `ProviderId` to a function expecting a `UserId`.
- **Zero Runtime Cost:** Branding is a compile-time construct; it disappears in the JS output.

---

## 3. Transactional Context Passing
Cross-cutting concerns like Multi-tenancy (RLS) and Transactions should be handled via Higher-Order Functions (HOF) rather than global state.

### ✅ The Pattern
The `withTenantContext` wrapper ensures all DB operations are isolated.

```typescript
export async function withTenantContext<T>(
  client: DBClient,
  tenantId: string,
  operation: (tx: TxClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  // 1. BEGIN
  // 2. SET LOCAL app.current_tenant = tenantId
  // 3. EXECUTE operation(tx)
  // 4. COMMIT/ROLLBACK
}
```

### 🧠 Rationale
- **Isolation:** Physically enforced by Postgres RLS using the session variable.
- **Cleanup:** `SET LOCAL` ensures the tenant context dies with the transaction.

---

## 4. Engineering Standards Summary

| Practice | Rule | Rationale |
|:---|:---|:---|
| **Error Handling** | No `throw`. Return `Result<T>`. | Deterministic control flow. |
| **Type Safety** | No `any`. No `as Type`. Use Zod. | Prevent runtime "detonations." |
| **Immutability** | Use `Readonly<T>` and `as const`. | Avoid side effects in data flow. |
| **Function Design** | Limit to 40 lines (KISS). | Maintain SRP and readability. |
| **Validation** | Parse at boundaries, don't validate inside. | "Parse, don't validate" (Alexis King). |

---

## 📚 Verifiable Sources

### Tier 1 — Autoritativas
- **TypeScript Official Handbook:** [Structural vs Nominal Typing](https://www.typescriptlang.org/docs/handbook/type-compatibility.html) (2024)
- **Postgres Documentation:** [Row Level Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) (2024)
- **Zod Documentation:** [Branding Guide](https://zod.dev/?id=brand) (2024)

### Tier 2 — Alta Confianza
- **Effect-TS / Neverthrow:** [Handling Errors as Values in TS](https://github.com/supermacro/neverthrow) (2023)
- **"Parse, Don't Validate" by Alexis King:** [The Philosophy of Type Design](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) (2019 - Foundation for Zod)
- **LogRocket Engineering:** [Nominal Typing in TypeScript](https://blog.logrocket.com/nominal-typing-in-typescript/) (2022)

### Tier 3 — Suplementario
- **Total TypeScript (Matt Pocock):** [Branded Types Explained](https://www.totaltypescript.com/concepts/branded-types) (2023)
- **Stripe Engineering Blog:** [How we use Go-style error handling in Ruby/TS](https://stripe.com/blog/error-handling) (2022)
