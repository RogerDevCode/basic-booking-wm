# Cuándo usar Record<string, unknown> vs Interfaces Tipadas

> Regla: Tipar todo lo que controlas. Usar `Record<string, unknown>` solo cuando la estructura es inherentemente dinámica.

---

## ✅ DEBE tiparse con interfaces

### 1. DB Rows (PostgreSQL)

Las queries que haces contra tu propio schema tienen estructura conocida y estable.

```typescript
// ✅ BIEN: Interface tipada
interface BookingRow {
  readonly booking_id: string;
  readonly status: string;
  readonly start_time: string;
  readonly end_time: string;
}

const rows = await sql<BookingRow[]>`SELECT ...`;
```

**Por qué:** Controlas el schema, los campos no cambian sin migración, y el beneficio de type safety es alto.

### 2. Return types de funciones `main()`

Cada script debe devolver un tipo específico, no `Record<string, unknown>`.

```typescript
// ✅ BIEN: Tipo específico
interface BookingResult {
  readonly booking_id: string;
  readonly status: string;
}

export async function main(rawInput: unknown): Promise<{
  success: boolean;
  data: BookingResult | null;
  error_message: string | null;
}> {
```

**Por qué:** Los consumidores del script necesitan saber qué campos esperar.

### 3. Config/Preferences con estructura conocida

```typescript
// ✅ BIEN: Interface con campos definidos
interface ReminderPrefs {
  readonly telegram_24h: boolean;
  readonly gmail_24h: boolean;
  readonly telegram_2h: boolean;
  readonly telegram_30min: boolean;
}
```

**Por qué:** Sabes exactamente qué campos existen y sus tipos.

---

## ⚠️ ACEPTABLE usar Record<string, unknown>

### 1. Respuestas de APIs externas (Google Calendar, Telegram, Gmail)

```typescript
// ✅ ACEPTABLE: API externa que no controlas
const data = await response.json() as Record<string, unknown>;
const eventId = typeof data['id'] === 'string' ? data['id'] : null;
```

**Por qué:**
- No controlas el schema de la API
- Las APIs cambian sin aviso (campos nuevos, deprecados)
- Solo accedes 2-3 campos de cada respuesta
- El costo de mantener interfaces actualizadas supera el beneficio

**Alternativa si quieres type safety mínimo:**
```typescript
// Compromiso: interface mínima con solo los campos que usas
interface GCalEventMinimal {
  readonly id?: string;
  readonly status?: string;
}
const data = await response.json() as GCalEventMinimal;
```

### 2. Metadata de logging

```typescript
// ✅ ACEPTABLE: Metadata flexible por diseño
interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown> | undefined;
}
```

**Por qué:** Cada llamada a log puede pasar campos arbitrarios.

### 3. Payloads de Dead Letter Queue

```typescript
// ✅ ACEPTABLE: Payloads originales de cualquier forma
interface DLQEntry {
  readonly original_payload: Record<string, unknown>;
}
```

**Por qué:** Los payloads pueden venir de cualquier script con cualquier estructura.

### 4. Campos JSONB en PostgreSQL

```typescript
// ✅ ACEPTABLE: JSONB es inherentemente flexible
interface PatientRow {
  readonly metadata: Record<string, unknown> | null;
}
```

**Por qué:** JSONB permite almacenar estructuras arbitrarias. Si el JSONB tiene una sub-estructura conocida, puedes tipar esa sub-estructura:

```typescript
// MEJOR: Si sabes la estructura del JSONB
interface PatientMetadata {
  readonly reminder_preferences?: ReminderPrefs;
}

interface PatientRow {
  readonly metadata: PatientMetadata | null;
}
```

### 5. Booking details para templates de mensajes

```typescript
// ✅ ACEPTABLE: Details variables según tipo de mensaje
type EmailDetails = Readonly<Record<string, unknown>>;

function buildEmailContent(messageType: string, details: EmailDetails) {
  const date = safeString(details['date'], 'Por confirmar');
  // ...
}
```

**Por qué:** Cada tipo de mensaje usa diferentes campos del details object.

---

## ❌ NUNCA usar Record<string, unknown>

### 1. Cuando la estructura es fija y conocida

```typescript
// ❌ MAL: Estructura conocida
function processBooking(row: Record<string, unknown>) {
  const id = String(row['booking_id']);
}

// ✅ BIEN
function processBooking(row: BookingRow) {
  const id = row.booking_id;
}
```

### 2. Como tipo de retorno de funciones públicas

```typescript
// ❌ MAL: El consumidor no sabe qué esperar
function getBooking(): Record<string, unknown> { ... }

// ✅ BIEN
function getBooking(): BookingResult { ... }
```

### 3. Para evitar definir interfaces

```typescript
// ❌ MAL: Pereza de definir tipos
const config: Record<string, unknown> = { maxRetries: 3, timeout: 5000 };

// ✅ BIEN
interface RetryConfig {
  readonly maxRetries: number;
  readonly timeout: number;
}
const config: RetryConfig = { maxRetries: 3, timeout: 5000 };
```

---

## Regla de decisión rápida

| ¿Puedes responder estas preguntas? | Usa |
|-------------------------------------|-----|
| ¿Conoces todos los campos y sus tipos? | Interface tipada |
| ¿Los campos pueden cambiar sin aviso? | `Record<string, unknown>` |
| ¿Controlas el schema/estructura? | Interface tipada |
| ¿Viene de una API externa? | `Record<string, unknown>` (o interface mínima) |
| ¿Es metadata/config dinámica? | `Record<string, unknown>` |
| ¿Es un DB row de tu schema? | Interface tipada |
| ¿Es el return type de una función pública? | Interface tipada |

---

## Estado actual del proyecto

| Categoría | Ocurrencias | Estado |
|-----------|-------------|--------|
| DB rows tipados | ~40 | ✅ Tipados con interfaces |
| Return types de main() | ~15 | ✅ Tipados con interfaces |
| Logger metadata | 6 | ⚠️ Legítimo (flexible por diseño) |
| JSONB fields | 5 | ⚠️ Parcialmente tipados |
| DLQ payloads | 4 | ⚠️ Legítimo (estructura arbitraria) |
| API responses externas | ~10 | ⚠️ Aceptable (no controlamos schema) |
| Booking details | ~4 | ⚠️ Aceptable (campos variables) |

**Total Record<string, unknown> restantes: ~34**
- **Legítimos:** ~24 (metadata, JSONB, DLQ, APIs externas, details)
- **Mejorables:** ~10 (podrían tener interfaces mínimas)
