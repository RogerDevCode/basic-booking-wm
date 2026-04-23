# Windmill TS/Bun Strict Mode Field Manual

## 1. Runtime Environment

Windmill executes TypeScript via **Bun runtime** [^37^]. Every script MUST export a single `main` function.
Windmill parses `main` signature into JSON Schema for UI generation and input pre-validation [^77^].
Bun bundles scripts at deploy time; add `//nobundling` header to disable if needed [^37^].

```typescript
// Default mode: pre-bundled by Bun
export async function main(userId: string, amount: number) {
  return { ok: true };
}
```

## 2. TypeScript v6.x Strict Compiler Flags

TypeScript 6.0 shipped March 23 2026 with `strict: true` as default [^93^].
Add these flags to `tsconfig.json` for SSOT-level enforcement:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "target": "ESNext",
    "module": "Preserve"
  }
}
```

`noUncheckedIndexedAccess` forces `T | undefined` on all array/object index access,
eliminating silent out-of-bounds crashes [^88^]. `exactOptionalPropertyTypes` blocks
explicit `undefined` assignment to optional keys, closing the `in` operator gap [^94^].

## 3. Zod Boundary Contracts

Windmill auto-generates UI schema from `main` signature, but this is compile-time metadata only.
For runtime SSOT, wrap every I/O boundary in **Zod** with `.strict()` [^60^] [^91^].

```typescript
import { z } from "zod";
import { ok, err, Result } from "neverthrow";

const IngestionSchema = z.object({
  patientId: z.string().uuid(),
  dosage: z.number().positive().max(9999),
  metadata: z.record(z.string())
}).strict(); // rejects unknown keys

type IngestionInput = z.infer&lt;typeof IngestionSchema&gt;;

function parseIngestion(raw: unknown): Result&lt;IngestionInput, Error&gt; {
  const parsed = IngestionSchema.safeParse(raw);
  if (!parsed.success) return err(new Error(parsed.error.message));
  return ok(parsed.data);
}
```

Use `windmill-ts` generator to produce Zod schemas and type-safe client wrappers for
inter-script calls [^62^]. This enforces caller/callee contract alignment at both compile
and runtime.

## 4. Function-to-Caller Contract Validation

Windmill scripts call other scripts via webhooks or `windmill-client`. Never trust the
remote signature. Define a **Contract Schema** shared between caller and callee.

```typescript
// shared.contract.ts
export const PatientQuerySchema = z.object({
  id: z.string().uuid().brand&lt;"PatientID"&gt;(),
  since: z.string().datetime().optional()
}).strict();

export type PatientQuery = z.infer&lt;typeof PatientQuerySchema&gt;;
```

Caller validates before emit; callee validates on ingress. Both sides use the same schema
file. Mismatches fail fast at runtime with typed Zod errors instead of silent coercion.

## 5. Silent Error Elimination

Silent failures in Windmill come from:
- JSON Schema UI allowing extra keys (no `.strict()`)
- Missing type guards on `unknown` catch variables
- Implicit `any` on array indexing
- Unhandled `Promise` rejections in async flows

Mitigations:
1. **Zod `.strict()`** on all ingress schemas [^91^]
2. **`useUnknownInCatchVariables`** forces explicit error narrowing [^16^]
3. **`noUncheckedIndexedAccess`** forces undefined checks on lookups [^88^]
4. **neverthrow `ResultAsync`** for async pipelines; errors propagate explicitly [^48^]

```typescript
import { ResultAsync, okAsync, errAsync } from "neverthrow";

function fetchPatient(id: string): ResultAsync&lt;Patient, FetchError&gt; {
  return ResultAsync.fromPromise(
    fetch(`/api/patients/${id}`),
    (e) =&gt; new FetchError("network", e)
  ).andThen((res) =&gt;
    res.ok ? okAsync(res.json() as Promise&lt;Patient&gt;) : errAsync(new FetchError("http", res.status))
  );
}
```

## 6. Go-Like / Java-Like Discipline

Adopt these patterns for systems-level rigor:

| Pattern | Implementation |
|--------|----------------|
| Branded Types | `type PatientID = string & { __brand: "PatientID" };` |
| Result&lt;T,E&gt; | `neverthrow` `ok` / `err` [^48^] |
| Option&lt;T&gt; | `z.optional()` combined with `exactOptionalPropertyTypes` |
| Readonly by default | `readonly` arrays, `as const` objects, `Object.freeze` |
| No throw for business logic | Reserve `throw` for panics; return `Result` for errors [^51^] |
| Explicit null over undefined | Use `null` for absent values; `undefined` only for uninitialized |

```typescript
type ProviderID = string & { __brand: "ProviderID" };
type PatientID = string & { __brand: "PatientID" };

function createProviderID(raw: string): Result&lt;ProviderID, Error&gt; {
  return z.string().uuid().safeParse(raw).success
    ? ok(raw as ProviderID)
    : err(new Error("invalid uuid"));
}

// Compile-time prevention of ID mixing
const pid: PatientID = "uuid" as PatientID;
const prov: ProviderID = pid; // TS ERROR: branded type mismatch
```

## 7. Bun Recompilation Control (Docker)

Bun `--watch` and `--hot` rely on OS-native fs events (kqueue/inotify). Inside Docker
containers or Windows mounts, these events often fail silently [^80^]. This causes Bun to
stop detecting changes or to miss-reload.

**Fixes:**
- **Disable Bun watch inside Docker**. Use `nodemon -L` (legacy polling) or `chokidar`
  with `usePolling: true` to trigger restarts [^80^] [^92^].
- **Exclude `node_modules`** from bind mounts via named volume to prevent fs churn [^56^].
- **Set `CHOKIDAR_USEPOLLING=true`** and `WATCHPACK_POLLING=true` if using Webpack/Bun
  bundler layers [^56^].

```yaml
# docker-compose.dev.yml
services:
  worker:
    volumes:
      - ./:/app
      - node_modules:/app/node_modules
    environment:
      - CHOKIDAR_USEPOLLING=true
volumes:
  node_modules:
```

Do NOT use `bun --hot` in Docker unless the mount supports inotify. Prefer explicit
`wmill sync push` from host to trigger reloads (see Section 8).

## 8. Local ↔ Windmill Docker Sync Protocol

Windmill CLI (`wmill`) is the single sync interface [^6^] [^20^].

```bash
# 1. Install CLI
npm install -g windmill-cli

# 2. Bind workspace
wmill workspace add dev http://localhost:8000 --token &lt;token&gt;
wmill workspace bind

# 3. Pull remote to local
wmill sync pull --skip-variables --skip-secrets --skip-resources

# 4. Edit scripts locally; regenerate metadata when changing main() signature
wmill generate-metadata f/scripts/my_script.ts

# 5. Push to Docker instance
wmill sync push --yes
```

**File structure per script:**
- `script.ts` — source code
- `script.script.yaml` — metadata + JSON schema of main signature
- `script.lock` — dependency lockfile

**Critical:** After modifying `main` parameters, run `wmill generate-metadata` before push.
Windmill uses the metadata file to render the UI and validate inputs; skipping this step
causes parameter drift between code and runtime schema [^6^].

For CI/CD promotion across environments, use `wmill.yaml` with workspace overrides and
`--promotion` flag [^20^].

## 9. TL;DR Checklist

- [ ] `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [ ] Every `main` input boundary wrapped in Zod `.strict()` schema
- [ ] Inter-script calls validated via shared contract schemas (windmill-ts generated)
- [ ] Business errors return `Result&lt;T,E&gt;` via neverthrow; `throw` reserved for panics
- [ ] Branded types for all domain IDs (PatientID, ProviderID)
- [ ] `readonly` / `as const` for all immutable data
- [ ] Docker dev: disable Bun `--hot`, use `wmill sync push` + nodemon polling if needed
- [ ] `wmill generate-metadata` executed after every signature change before push
