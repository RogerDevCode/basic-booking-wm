# Library Signatures — booking-titanium-wm

> Key exports by domain. Read feature-map.md first for folder context.
> All `main()` functions follow: `async function main(rawInput: unknown): Promise<Result<T>>`

## Internal Utilities (f/internal/)

```typescript
// result.ts
type Result<T> = [Error | null, T | null]

// tenant-context/index.ts
async function withTenantContext<T>(sql, tenantId: string, fn: (tx) => Promise<Result<T>>): Promise<Result<T>>

// db/client.ts
function createDbClient(opts: { url: string }): postgres.Sql

// crypto.ts
async function hashPassword(password: string): Promise<string>
async function verifyPassword(password: string, hash: string): Promise<boolean>
function validatePasswordPolicy(password: string): { valid: boolean; errors: string[] }

// fetch-retry/index.ts
async function fetchWithRetry(url: string, opts, maxRetries?: number): Promise<Response>
```

## Booking FSM (f/internal/booking_fsm/)

```typescript
// types.ts
type BookingStep = 'idle' | 'selecting_specialty' | 'selecting_doctor' | 'selecting_time' | 'confirming' | 'completed'
interface BookingState { name: BookingStep; items?: readonly Item[]; ... }
interface DraftBooking { specialty_id, specialty_name, provider_id, provider_name, service_id, service_name, time_slot, ... }

// index.ts
function emptyDraft(): DraftBooking
function transition(state: BookingState, action: BookingAction, draft: DraftBooking): TransitionResult
const BookingStateSchema: ZodSchema<BookingState>
function buildMainMenuKeyboard(): InlineButton[][]

// data-slots.ts
async function fetchDataForState(state: BookingState, chatId: string): Promise<{ text: string; keyboard: InlineButton[][] } | null>

// responses.ts
function buildResponseForState(state: BookingState, draft: DraftBooking): { text: string; keyboard: InlineButton[][] }
```

## Telegram Router (f/internal/telegram_router/)

```typescript
// main.ts — returns RouterOutput (NOT Result<T> tuple)
async function main(rawInput: unknown): Promise<RouterOutput>

// types.ts
interface RouterOutput { data: RouteResult | null; error: string | null }
interface RouteResult {
  route: RouteType; forward_to_ai: boolean; response_text: string;
  inline_keyboard: InlineButton[][]; nextState: BookingState | null;
  nextDraft: DraftBooking | null; nextFlowStep: number;
  should_edit: boolean; message_id: number | null;
}

// services.ts
function buildRouteResult(route, responseText, opts): RouteResult
function isWizardCallback(data: string | null): boolean
function matchCallback(data): RouteResult | null
function matchCommand(text): RouteResult | null
function matchMenu(text): RouteResult | null
```

## Conversation State (f/internal/conversation-state/)

```typescript
interface ConversationState {
  chat_id: string; intent: string; entities: Record<string, unknown>;
  flow_step: number; booking_state: BookingState | null;
  booking_draft: DraftBooking | null; message_id: number | null;
}
async function updateConversationState(chatId, opts): Promise<Result<void>>
```

## Key Feature main() Signatures

```typescript
// booking_create/main.ts
async function main(rawInput: unknown): Promise<Result<BookingResult>>
// Input: { provider_id, client_id, service_id, start_time, idempotency_key }

// booking_cancel/main.ts
async function main(rawInput: unknown): Promise<Result<{ booking_id: string; status: string }>>
// Input: { booking_id, provider_id, reason? }

// booking_reschedule/main.ts
async function main(rawInput: unknown): Promise<Result<BookingResult>>
// Input: { booking_id, provider_id, new_start_time, new_end_time }

// telegram_send/main.ts — returns RouterOutput style
async function main(rawInput: unknown): Promise<{ data: SendResult | null; error: string | null }>
// mode: 'send_message' | 'edit_message' | 'answer_callback'

// gcal_sync/main.ts
async function main(rawInput: unknown): Promise<Result<SyncResult>>
// Input: { booking_id, provider_id, action: 'create'|'update'|'delete' }

// rag_query/main.ts
async function main(rawInput: unknown): Promise<Result<RAGResult>>
// Input: { query, provider_id, top_k?, category? }

// web_provider_profile/main.ts
async function main(rawInput: unknown): Promise<Result<unknown>>
// action: 'get_profile' | 'update_profile' | 'change_password'

// web_patient_profile/main.ts
async function main(rawInput: unknown): Promise<Result<ProfileResult>>
// action: 'get' | 'update'; user_id required
```

## Zod Schema Patterns

```typescript
// Standard input schema pattern:
const InputSchema = z.object({
  provider_id: z.uuid(),           // not z.string().uuid() — Zod v4
  booking_id:  z.uuid(),
  status:      z.enum(['pendiente', 'confirmada', 'cancelada', ...]),
}).readonly();

// Result extraction:
const parsed = InputSchema.safeParse(rawInput);
if (!parsed.success) return [new Error(`validation_error: ${parsed.error.message}`), null];
```
