# Codebase Index — booking-titanium-wm

> Auto-generado por `scripts/gen-codex-index.sh`. No editar manualmente.
> Última actualización: 2026-04-18 18:50 UTC

**Guías relacionadas:** `.ai-codex/feature-map.md` · `.ai-codex/lib.md` · `.ai-codex/schema.md`

---

### `admin_honorifics/`
> CRUD for honorifics management (list, create, update, delete)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<unknown>>`

**`services.ts`**
  - `export async function listHonorifics(tx: postgres.Sql): Promise<Result<HonorificRow[]>>`
  - `export async function listHonorificsGlobal(client: postgres.Sql): Promise<Result<HonorificRow[]>>`
  - `export async function createHonorific(`
  - `export async function updateHonorific(`
  - `export async function deleteHonorific(tx: postgres.Sql, id: string): Promise<Result<`

**`types.ts`**
  - `export const ActionSchema`
  - `export const InputSchema`
  - `export interface HonorificRow`
  - `export type Input`

### `auth_provider/`
> Password management for providers (generate temp, change, verify)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<unknown>>`

**`services.ts`**
  - `export async function adminGenerateTempPassword(`
  - `export async function providerChangePassword(`
  - `export async function providerVerify(`
  - `export type HandlerFunc`
  - `export const HANDLERS: Readonly<Record<AuthAction, HandlerFunc>>`
  - `export async function dispatchAction(`

**`types.ts`**
  - `export const ActionSchema`
  - `export type AuthAction`
  - `export const InputSchema`
  - `export type AuthInput`
  - `export interface TempPasswordResult`
  - `export interface PasswordChangeResult`
  - `export interface VerifyResult`

### `availability_check/`
> Get available time slots for a provider on a given date

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<AvailabilityResult>>`

**`services.ts`**
  - `export async function getProviderServiceId(tx: postgres.Sql, providerId: string): Promise<string | null>`
  - `export async function getProvider(`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface TimeSlot`
  - `export interface AvailabilityResult`
  - `export interface ProviderRow`

### `booking_cancel/`
> Cancel an existing medical appointment

**`main.ts`**
  - `export async function main(`

**`services.ts`**
  - `export function authorizeActor(`
  - `export async function fetchBooking(`

**`types.ts`**
  - `export const InputSchema`
  - `export type CancelBookingInput`
  - `export interface CancelResult`
  - `export interface BookingLookup`
  - `export interface UpdatedBooking`

### `booking_create/`
> Create a new medical appointment (SOLID Refactor)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<BookingCreated>>`

**`services.ts`**
  - `export async function fetchBookingContext(`
  - `export async function checkAvailability(`
  - `export async function persistBooking(`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface BookingCreated`
  - `export interface BookingContext`

### `booking_orchestrator/`
> Routes AI intents to booking actions (create, cancel, reschedule, list)

**`getEntity.ts`**
  - `export function getEntity(entities: Record<string, string | null>, key: string): string | undefined`

**`handleCancelBooking.ts`**
  - `export async function handleCancelBooking(`

**`handleCreateBooking.ts`**
  - `export async function handleCreateBooking(`

**`handleGetMyBookings.ts`**
  - `export async function handleGetMyBookings(`

**`handleListAvailable.ts`**
  - `export async function handleListAvailable(`

**`handleReschedule.ts`**
  - `export async function handleReschedule(`

**`main.ts`**
  - `export async function main(`

**`normalizeIntent.ts`**
  - `export function normalizeIntent(intent: string): OrchestratorBookingIntent | null`

**`resolveContext.ts`**
  - `export async function resolveContext(`

**`types.ts`**
  - `export type OrchestratorBookingIntent`
  - `export const InputSchema`
  - `export type InputType`
  - `export interface OrchestratorResult`
  - `export interface AvailabilitySlot`
  - `export interface AvailabilityData`
  - `export interface BookingRow`
  - `export interface ResolvedContext`

### `booking_reschedule/`
> Cancel old booking + create new one atomically (reschedule)

**`authorize.ts`**
  - `export function authorize(input: Input, booking: BookingRow): Result<true>`

**`executeReschedule.ts`**
  - `export async function executeReschedule(sql: Sql, input: Input, oldBooking: BookingRow, service: ServiceRow): Promise<Result<RescheduleWriteResult>>`

**`fetchBooking.ts`**
  - `export async function fetchBooking(sql: Sql, id: string): Promise<Result<BookingRow>>`

**`fetchService.ts`**
  - `export async function fetchService(sql: Sql, id: string): Promise<Result<ServiceRow>>`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<RescheduleResult>>`

**`types.ts`**
  - `export type Sql`
  - `export type Input`
  - `export interface RescheduleResult`
  - `export interface RescheduleWriteResult`
  - `export const InputSchema`

### `booking_search/`
> Search and filter bookings

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<BookingSearchResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface BookingSearchRow`
  - `export interface BookingSearchResult`

### `booking_wizard/`
> Multi-step appointment booking flow (availability → confirmation → creation)

**`DateUtils.ts`**
  - `export const DateUtils`

**`WizardRepository.ts`**
  - `export class WizardRepository`

**`WizardRouter.ts`**
  - `export class WizardRouter`

**`WizardUI.ts`**
  - `export const WizardUI`

**`BackHandler.ts`**
  - `export class BackHandler implements ActionHandler`

**`CancelHandler.ts`**
  - `export class CancelHandler implements ActionHandler`

**`ConfirmHandler.ts`**
  - `export class ConfirmHandler implements ActionHandler`

**`SelectDateHandler.ts`**
  - `export class SelectDateHandler implements ActionHandler`

**`SelectTimeHandler.ts`**
  - `export class SelectTimeHandler implements ActionHandler`

**`StartHandler.ts`**
  - `export class StartHandler implements ActionHandler`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<Record<string, unknown>>>`

**`types.ts`**
  - `export const WizardStateSchema`
  - `export type WizardState`
  - `export const InputSchema`
  - `export type Input`
  - `export interface StepView`
  - `export interface ActionContext`
  - `export interface ActionHandler`

### `circuit_breaker/`
> Service health monitor and failure isolation (circuit breaker pattern)

**`getCircuitBreakerTx.ts`**
  - `export async function getCircuitBreakerTx<T>(client: postgres.Sql, operation: (tx: postgres.Sql)`

**`getState.ts`**
  - `export async function getState(tx: postgres.Sql, serviceId: string): Promise<CircuitState | null>`

**`initService.ts`**
  - `export async function initService(tx: postgres.Sql, serviceId: string): Promise<void>`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, CircuitBreakerResult | CircuitState | null]>`

**`types.ts`**
  - `export type Result<T>`
  - `export interface CircuitState`
  - `export interface CircuitBreakerRow`
  - `export interface CircuitBreakerResult`
  - `export const InputSchema`

### `conversation_logger/`
> Log messages to conversations table (incoming/outgoing)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<LogResult>>`

**`services.ts`**
  - `export async function persistLog(`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface LogResult`

### `distributed_lock/`
> Advisory lock for race condition prevention (booking_locks table)

**`acquireLock.ts`**
  - `export async function acquireLock(tx: postgres.Sql, input: Input): Promise<Result<LockResult>>`

**`checkLock.ts`**
  - `export async function checkLock(tx: postgres.Sql, input: Input): Promise<Result<LockResult>>`

**`cleanupLocks.ts`**
  - `export async function cleanupLocks(tx: postgres.Sql): Promise<Result<LockResult>>`

**`executeLockAction.ts`**
  - `export async function executeLockAction(tx: postgres.Sql, input: Input): Promise<Result<LockResult>>`

**`main.ts`**
  - `export async function main(`

**`mapRowToLockInfo.ts`**
  - `export function mapRowToLockInfo(row: LockRow): LockInfo`

**`releaseLock.ts`**
  - `export async function releaseLock(tx: postgres.Sql, input: Input): Promise<Result<LockResult>>`

**`tryInsertLock.ts`**
  - `export async function tryInsertLock(tx: postgres.Sql, input: Input, expiresAt: Date): Promise<Result<LockRow>>`

**`tryStealExpiredLock.ts`**
  - `export async function tryStealExpiredLock(tx: postgres.Sql, input: Input, expiresAt: Date): Promise<Result<LockRow>>`

**`types.ts`**
  - `export type Input`
  - `export interface LockInfo`
  - `export interface LockResult`
  - `export interface LockRow`
  - `export const InputSchema`

### `dlq_processor/`
> Dead Letter Queue (DLQ) processor for failed bookings.

**`ActionInterfaces.ts`**
  - `export interface ActionContext`
  - `export interface ActionHandler`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<unknown>>`

**`services.ts`**
  - `export async function withGlobalTx<T>(`
  - `export async function listDLQ(tx: TxClient, filter?: string): Promise<Result<unknown>>`
  - `export async function retryDLQ(tx: TxClient, dlq_id?: number): Promise<Result<unknown>>`
  - `export async function resolveDLQ(`
  - `export async function discardDLQ(`
  - `export async function getDLQStatus(tx: TxClient): Promise<Result<unknown>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export const DLQResultSchema`
  - `export const DLQRowSchema`
  - `export type DLQEntry`
  - `export type TxClient`

### `gcal_reconcile/`
> Cron job to retry pending GCal syncs (every 5 minutes)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, ReconcileResult | null]>`

**`services.ts`**
  - `export function extractGCalId(data: unknown): string | null`
  - `export async function callGCalAPI(`
  - `export async function retryWithBackoff<T>(`
  - `export async function syncBookingToGCal(`

**`types.ts`**
  - `export const InputSchema`
  - `export type ReconcileInput`
  - `export interface ReconcileResult`
  - `export interface BookingRow`
  - `export const GCalEventSchema`
  - `export type GCalEventData`
  - `export interface GCalAPIResult`
  - `export interface SyncResult`

### `gcal_sync/`
> Sync booking to Google Calendar (provider + client)

**`callGCalAPI.ts`**
  - `export async function callGCalAPI(method: string, path: string, calendarId: string, accessToken: string, body?: object): Promise<Result<Readonly<Record<string, unknown>>>>`

**`fetchBookingDetails.ts`**
  - `export async function fetchBookingDetails(sql: Sql, tenantId: string, bookingId: string): Promise<Result<BookingDetails>>`

**`main.ts`**
  - `export async function main(`

**`syncEvent.ts`**
  - `export async function syncEvent(action: 'create' | 'update' | 'delete', calendarId: string | null, eventId: string | null, accessToken: string, eventData: BookingEventData, maxRetries: number): Promise<Result<string | null>>`

**`types.ts`**
  - `export type Sql`
  - `export type Input`
  - `export interface GCalSyncResult`
  - `export interface BookingDetails extends BookingEventData`
  - `export const InputSchema`

**`updateBookingSyncStatus.ts`**
  - `export async function updateBookingSyncStatus(sql: Sql, tenantId: string, bookingId: string, update:`

### `gcal_webhook_receiver/`
> Process incoming Google Calendar push notifications

**`fetchCalendarEvents.ts`**
  - `export async function fetchCalendarEvents(calendarId: string, accessToken: string, syncToken: string | null): Promise<GCalFetchResult>`

**`isGCalEventsResponse.ts`**
  - `export function isGCalEventsResponse(data: unknown): data is GCalEventsResponse`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, WebhookResult | null]>`

**`types.ts`**
  - `export interface GCalEventItem`
  - `export interface GCalEventsResponse`
  - `export interface GCalFetchResult`
  - `export interface WebhookResult`
  - `export const InputSchema`

### `gcal_webhook_renew/`
> Renew expiring Google Calendar push notification channel

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<RenewResult>>`

**`services.ts`**
  - `export async function stopChannel(accessToken: string, channelId: string, resourceId: string): Promise<boolean>`
  - `export async function renewChannel(input: Input): Promise<Result<RenewResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface RenewResult`

### `gcal_webhook_setup/`
> Register Google Calendar push notification channel

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<WebhookSetupResult>>`

**`services.ts`**
  - `export function getConfiguration(input: Input): Result<InternalConfig>`
  - `export async function setupWebhook(input: Input): Promise<Result<WebhookSetupResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export const GCalWatchResponseSchema`
  - `export type GCalWatchResponse`
  - `export interface WebhookSetupResult`

### `gmail_send/`
> Send email notifications with HTML action links (confirm/cancel/reschedule)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, GmailSendData | null]>`

**`services.ts`**
  - `export function safeString(value: unknown, fallback`
  - `export function buildEmailContent(`
  - `export async function sendWithRetry(`

**`types.ts`**
  - `export const InputSchema`
  - `export interface ActionLink`
  - `export type EmailDetails`
  - `export interface GmailSendData`

### `health_check/`
> System health monitoring (DB, GCal, Telegram, Gmail)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<`

**`services.ts`**
  - `export async function checkDatabase(dbUrl: string): Promise<ComponentStatus>`
  - `export async function checkGCal(accessToken: string): Promise<ComponentStatus>`
  - `export async function checkTelegram(botToken: string): Promise<ComponentStatus>`
  - `export function checkGmail(smtpPassword: string): Promise<ComponentStatus>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface ComponentStatus`

### `internal/`

**`constants.ts`**
  - `export const INTENT`
  - `export type IntentType`
  - `export const CONFIDENCE_THRESHOLDS: Record<IntentType, number>`
  - `export const INTENT_KEYWORDS: Record<string,`
  - `export const NORMALIZATION_MAP: Record<string, string>`
  - `export const PROFANITY_TO_IGNORE`
  - `export const OFF_TOPIC_PATTERNS`
  - `export const GREETINGS`

**`guardrails.ts`**
  - `export function validateInput(text: string): GuardrailResult`
  - `export function validateOutput(content: string): GuardrailResult`
  - `export function sanitizeJSONResponse(raw: string): string`
  - `export function verifyUrgency(result: IntentResult, text: string): IntentResult`

**`llm-client.ts`**
  - `export interface LLMResponse`
  - `export async function callLLM(`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<`

**`prompt-builder.ts`**
  - `export function buildSystemPrompt(ragContext?: string): string`
  - `export function buildUserMessage(text: string): string`

**`rag-context.ts`**
  - `export interface FAQEntry`
  - `export interface RAGContextResult`
  - `export function buildRAGQuery(`
  - `export async function buildRAGContext(`

**`services.ts`**
  - `export function adjustIntentWithContext(`
  - `export function extractEntities(text: string): EntityMap`
  - `export function detectContext(text: string, entities: EntityMap): AvailabilityContext`
  - `export function suggestResponseType(intent: IntentType, context: AvailabilityContext, entities: EntityMap): string`
  - `export function mapToDialogueAndUI(`
  - `export function determineEscalationLevel(`
  - `export function generateAIResponse(`
  - `export function detectIntentRules(text: string):`

**`tfidf-classifier.ts`**
  - `export interface TfIdfResult`
  - `export function classifyIntent(text: string): TfIdfResult`

**`tracing.ts`**
  - `export type TraceProvider`
  - `export interface TraceData`
  - `export interface TraceEmitter`
  - `export class ConsoleTraceEmitter implements TraceEmitter`
  - `export function setTraceEmitter(emitter: TraceEmitter): void`
  - `export function trace(data: TraceData): void`
  - `export function buildTrace(`

**`types.ts`**
  - `export const ConversationStateSchema`
  - `export type ConversationState`
  - `export const AIAgentInputSchema`
  - `export const EntityMapSchema`
  - `export const AvailabilityContextSchema`
  - `export const SocialSubtypeSchema`
  - `export const ReminderSubtypeSchema`
  - `export const NavSubtypeSchema`

**`data-doctors.ts`**
  - `export type ProviderRow`
  - `export interface FetchDoctorsResult`
  - `export async function fetchDoctors(`

**`data-slots.ts`**
  - `export interface TimeSlot`
  - `export interface FetchSlotsResult`
  - `export async function fetchSlots(`

**`data-specialties.ts`**
  - `export type ServiceRow`
  - `export interface FetchSpecialtiesResult`
  - `export async function fetchSpecialties(`

**`index.ts`**
  - `export`
  - `export`
  - `export const BookingFSM`
  - `export`
  - `export const BookingUI`
  - `export`
  - `export`
  - `export`

**`machine.ts`**
  - `export function parseAction(text: string): BookingAction`
  - `export function applyTransition(`
  - `export const STEP_TO_FLOW_STEP: Readonly<Record<string, number>>`
  - `export function flowStepFromState(state: BookingState): number`
  - `export function parseCallbackData(data: string): BookingAction | null`

**`responses.ts`**
  - `export function buildSpecialtyPrompt(`
  - `export function buildDoctorsPrompt(`
  - `export function buildSlotsPrompt(`
  - `export function buildConfirmationPrompt(timeLabel: string, doctorName: string, extra?: string): string`
  - `export function buildLoadingDoctorsPrompt(specialtyName: string): string`
  - `export function buildLoadingSlotsPrompt(doctorName: string): string`
  - `export function buildNoSpecialtiesAvailable(): string`
  - `export function buildNoDoctorsAvailable(specialtyName: string): string`

**`types.ts`**
  - `export const BOOKING_STEP`
  - `export type BookingStepName`
  - `export const IdleStateSchema`
  - `export const SelectingSpecialtySchema`
  - `export const SelectingDoctorSchema`
  - `export const SelectingTimeSchema`
  - `export const ConfirmingSchema`
  - `export const CompletedSchema`

**`index.ts`**
  - `export async function cacheGet(`
  - `export async function cacheSet(`
  - `export async function cacheInvalidate(text: string): Promise<Result<null>>`
  - `export async function cacheStats(): Promise<Result<CacheStats>>`
  - `export async function cacheClear(): Promise<Result<number>>`

**`index.ts`**
  - `export type`
  - `export const MAX_RETRIES`
  - `export const RETRY_BACKOFF_BASE_MS`
  - `export const RETRY_BACKOFF_MULTIPLIER`
  - `export const MAX_GCAL_RETRIES`
  - `export const TIMEOUT_GCAL_API_MS`
  - `export const TIMEOUT_TELEGRAM_API_MS`
  - `export const TIMEOUT_TELEGRAM_CALLBACK_MS`

**`index.ts`**
  - `export type ConversationState`
  - `export function toLegacyFormat(state: ConversationState):`
  - `export function fromLegacyFormat(`
  - `export function createConversationRedis(): Redis | null`
  - `export async function getConversationState(`
  - `export async function updateConversationState(`
  - `export async function clearConversationState(`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<GetStateOutput>`

**`services.ts`**
  - `export function validateInput(rawInput: unknown): Result<ChatId>`
  - `export async function fetchConversationData(chatId: string): Promise<Result<FetchResult>>`
  - `export function formatOutput(`

**`types.ts`**
  - `export const InputSchema`
  - `export type ChatId`
  - `export interface GetStateOutput`
  - `export interface FetchResult`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<UpdateOutput>`

**`services.ts`**
  - `export function validateInput(rawInput: unknown): Result<UpdateInput>`
  - `export async function processConversationUpdate(data: UpdateInput): Promise<Result<boolean>>`
  - `export function formatOutput(success: boolean, updated: boolean, error_message: string | null): UpdateOutput`

**`types.ts`**
  - `export const InputSchema`
  - `export type UpdateInput`
  - `export interface UpdateOutput`

**`index.ts`**
  - `export interface PasswordHashOptions`
  - `export async function hashPassword(plain: string, opts?: PasswordHashOptions): Promise<string>`
  - `export async function verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `export function generateReadablePassword(length`
  - `export interface PasswordPolicyResult`
  - `export function validatePasswordPolicy(plain: string): PasswordPolicyResult`
  - `export function encryptData(plain: string): string`
  - `export function decryptData(encryptedJson: string): string`

**`index.ts`**
  - `export interface ResolveDateOpts`
  - `export function resolveDate(`
  - `export function resolveTime(input: string): string | null`
  - `export function todayYMD(opts: Pick<ResolveDateOpts, 'timezone' | 'referenceDate'>`

**`index.ts`**
  - `export type UUID`
  - `export function isUUID(value: unknown): value is UUID`
  - `export function toUUID(value: string): UUID | null`
  - `export const VALID_BOOKING_STATUSES`
  - `export const VALID_GCAL_SYNC_STATUSES`
  - `export interface ProviderRow`
  - `export interface ServiceRow`
  - `export interface ClientRow`

**`client.ts`**
  - `export interface DBConfig`
  - `export function createDbClient(config: DBConfig): postgres.Sql`

**`index.ts`**
  - `export interface FetchWithRetryOptions extends RequestInit`
  - `export async function fetchWithRetry(`

**`buildGCalEvent.ts`**
  - `export interface BookingEventData`
  - `export interface GoogleCalendarEvent`
  - `export function buildGCalEvent(`

**`oauth.ts`**
  - `export async function getValidAccessToken(`

**`index.ts`**
  - `export const logger`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<MessageParserResponse>`

**`services.ts`**
  - `export const CONSTANTS`
  - `export function validateInput(rawInput: unknown): Result<MessageParserInput>`
  - `export function constructUsername(user_metadata?: MessageParserInput['user_metadata']): string`
  - `export function sanitizeText(text: string): string`
  - `export function createErrorResponse(errorMessage: string): MessageParserResponse`
  - `export function createSuccessResponse(chatIdNum: number, safeText: string, constructedName: string): MessageParserResponse`

**`types.ts`**
  - `export const MessageParserInputSchema`
  - `export type MessageParserInput`
  - `export interface MessageParserData`
  - `export interface MessageParserResponse`

**`result.ts`**
  - `export type Result<T>`
  - `export function ok<T>(data: T): Result<T>`
  - `export function fail<T>(error: Error | string): Result<T>`
  - `export function isOk<T>(result: Result<T>): result is [null, T]`
  - `export function isFail<T>(result: Result<T>): result is [Error, null]`
  - `export async function wrap<T>(promise: Promise<T>): Promise<Result<T>>`

**`index.ts`**
  - `export type Result<T, E`
  - `export function ok<T>(value: T): Result<T>`
  - `export function err<E>(e: E): Result<never, E>`
  - `export function isError<T, E>(result: Result<T, E>): result is [E, null]`
  - `export function isOk<T, E>(result: Result<T, E>): result is [null, T]`

**`index.ts`**
  - `export interface RetryOptions`
  - `export type RetryResult<T>`
  - `export function isPermanentError(error: Error): boolean`
  - `export function calculateBackoff(attempt: number, options?: Pick<RetryOptions, 'baseBackoffMs' | 'multiplier'>): number`
  - `export async function retryWithBackoff<T>(`
  - `export async function sleep(ms: number): Promise<void>`

**`index.ts`**
  - `export interface TimeSlot`
  - `export interface AvailabilityQuery`
  - `export interface AvailabilityResult`
  - `export interface AffectedBooking`
  - `export async function getAvailability(`
  - `export async function getAvailabilityRange(`
  - `export interface OverrideValidation`
  - `export async function validateOverride(`

**`index.ts`**
  - `export type`
  - `export const VALID_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>>`
  - `export const STATE_MACHINE: Readonly<Record<BookingStatus, readonly BookingStatus[]>>`
  - `export function validateTransition(`

**`formatResponse.ts`**
  - `export function formatResponse(output: BubbleOutput): void`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<BubbleReport>>`

**`services.ts`**
  - `export function createRedis(): Redis | null`
  - `export async function getConvState(redis: Redis, chatId: string): Promise<ConvState>`
  - `export async function setConvState(redis: Redis, chatId: string, bookingState: BookingState, draft: DraftBooking, messageId: number | null): Promise<void>`
  - `export async function clearConvState(redis: Redis, chatId: string): Promise<void>`
  - `export class TelegramBubble`

**`types.ts`**
  - `export interface InlineButton`
  - `export interface BubbleOutput`
  - `export interface ConvState`
  - `export interface BubbleReport`

**`booking-wizard.ts`**
  - `export interface WizardOutput`
  - `export async function handleBookingWizard(input: WizardInput): Promise<[Error | null, WizardOutput | null]>`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<RouterOutput>`

**`services.ts`**
  - `export const COMMANDS: Readonly<Record<string, string>>`
  - `export const COMMAND_RESPONSES: Readonly<Record<string, string>>`
  - `export function isWizardCallback(data: string | null): boolean`
  - `export function buildRouteResult(`
  - `export function matchCallback(data: string | null): RouteResult | null`
  - `export function matchCommand(text: string | null): RouteResult | null`
  - `export function matchMenu(text: string | null): RouteResult | null`

**`types.ts`**
  - `export type RouteType`
  - `export interface InlineButton`
  - `export interface RouteResult`
  - `export const InputSchema`
  - `export type RouterInput`
  - `export interface RouterOutput`

**`index.ts`**
  - `export type`
  - `export type TxClient`
  - `export async function withTenantContext<T>(`
  - `export async function getCurrentTenant(`

### `nlu/`

**`constants.ts`**
  - `export`
  - `export type`

### `noshow_trigger/`
> Mark expired confirmed bookings as no_show (SOLID Refactor)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, NoShowStats | null]>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface NoShowStats`
  - `export const ProviderRowSchema`
  - `export type ProviderRow`

### `patient_register/`
> Create or update client records

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<ClientResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface ClientResult`

### `provider_agenda/`
> View provider daily/weekly schedule with bookings

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<AgendaResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface AgendaResult`

### `provider_dashboard/`
> Provider dashboard backend (schedule, bookings, overrides, stats)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, Record<string, unknown> | null]>`

**`services.ts`**
  - `export async function getProvider(tx: postgres.Sql, input: Input): Promise<Result<unknown>>`
  - `export async function getWeek(tx: postgres.Sql, input: Input): Promise<Result<unknown>>`
  - `export async function getDaySlots(tx: postgres.Sql, input: Input): Promise<Result<unknown>>`
  - `export async function blockDate(tx: postgres.Sql, input: Input): Promise<Result<unknown>>`
  - `export async function unblockDate(tx: postgres.Sql, input: Input): Promise<Result<unknown>>`
  - `export async function saveSchedule(tx: postgres.Sql, input: Input): Promise<Result<unknown>>`
  - `export async function listServices(tx: postgres.Sql, input: Input): Promise<Result<unknown>>`
  - `export async function listOverrides(tx: postgres.Sql, input: Input): Promise<Result<unknown>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`

### `provider_manage/`
> CRUD for providers, services, schedules, and schedule overrides

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<Readonly<Record<string, unknown>>>>`

**`services.ts`**
  - `export async function handleProviderActions(tx: TxClient, input: Input): Promise<Result<Record<string, unknown>>>`
  - `export async function handleServiceActions(tx: TxClient, input: Input): Promise<Result<Record<string, unknown>>>`
  - `export async function handleScheduleActions(tx: TxClient, input: Input): Promise<Result<Record<string, unknown>>>`
  - `export async function handleOverrideActions(tx: TxClient, input: Input): Promise<Result<Record<string, unknown>>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`

### `rag_query/`
> Semantic search against knowledge base using pgvector (fallback to keyword)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<RAGResult>>`

**`services.ts`**
  - `export class KBRepository`
  - `export function performKeywordSearch(`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface KBEntry`
  - `export interface RAGResult`
  - `export interface KBRow`

### `reminder_config/`
> Configure reminder preferences (channel toggles, time windows)

**`buildConfigMessage.ts`**
  - `export function buildConfigMessage(prefs: ReminderPrefs):`

**`buildWindowConfig.ts`**
  - `export function buildWindowConfig(prefs: ReminderPrefs):`

**`formatPrefs.ts`**
  - `export function formatPrefs(prefs: ReminderPrefs): string`

**`loadPreferences.ts`**
  - `export async function loadPreferences(sql: SqlClient, clientId: string): Promise<ReminderPrefs>`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, ReminderConfigResult | null]>`

**`savePreferences.ts`**
  - `export async function savePreferences(sql: SqlClient, clientId: string, prefs: ReminderPrefs): Promise<boolean>`

**`setAll.ts`**
  - `export function setAll(_prefs: ReminderPrefs, value: boolean): ReminderPrefs`

**`toggleValue.ts`**
  - `export function toggleValue(prefs: ReminderPrefs, key: string): ReminderPrefs`

**`types.ts`**
  - `export type SqlClient`
  - `export type ReminderPrefs`
  - `export interface ClientMetadataRow`
  - `export interface ReminderConfigResult`
  - `export const InputSchema`

### `reminder_cron/`
> Send 24h/2h/30min appointment reminders via Telegram + Gmail

**`communicators.ts`**
  - `export async function sendTelegramReminder(`
  - `export async function sendGmailReminder(`

**`formatters.ts`**
  - `export function formatDate(date: Date, tz: string): string`
  - `export function formatTime(date: Date, tz: string): string`
  - `export function getClientPreference(`
  - `export function buildBookingDetails(`
  - `export function buildInlineButtons(`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, CronResult | null]>`

**`repository.ts`**
  - `export async function markReminder24hSent(tx: postgres.Sql, bookingId: string): Promise<void>`
  - `export async function markReminder2hSent(tx: postgres.Sql, bookingId: string): Promise<void>`
  - `export async function markReminder30minSent(tx: postgres.Sql, bookingId: string): Promise<void>`
  - `export async function markReminderSent(tx: postgres.Sql, bookingId: string, window: ReminderWindow): Promise<void>`
  - `export async function getBookingsFor24h(`
  - `export async function getBookingsFor2h(`
  - `export async function getBookingsFor30min(`
  - `export async function getBookingsForWindow(`

**`services.ts`**
  - `export`
  - `export`
  - `export`

**`types.ts`**
  - `export const InputSchema`
  - `export type ReminderWindow`
  - `export interface ReminderPrefs`
  - `export interface BookingRecord`
  - `export interface ScriptResponse`
  - `export interface CronResult`

### `telegram_auto_register/`
> Auto-register user from Telegram webhook payload

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<RegisterResult>>`

**`services.ts`**
  - `export async function registerTelegramUser(`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface RegisterResult`

### `telegram_callback/`
> Handle Telegram inline keyboard button actions (confirm, cancel, reschedule)

**`TelegramRouter.ts`**
  - `export class TelegramRouter`

**`answerCallbackQuery.ts`**
  - `export async function answerCallbackQuery(botToken: string, callbackQueryId: string, text: string, showAlert`

**`confirmBooking.ts`**
  - `export async function confirmBooking(tx: postgres.Sql, bookingId: string, clientId: string | undefined): Promise<[Error | null, boolean]>`

**`AcknowledgeHandler.ts`**
  - `export class AcknowledgeHandler implements ActionHandler`

**`ActivateRemindersHandler.ts`**
  - `export class ActivateRemindersHandler implements ActionHandler`

**`CancelHandler.ts`**
  - `export class CancelHandler implements ActionHandler`

**`ConfirmHandler.ts`**
  - `export class ConfirmHandler implements ActionHandler`

**`DeactivateRemindersHandler.ts`**
  - `export class DeactivateRemindersHandler implements ActionHandler`

**`RescheduleHandler.ts`**
  - `export class RescheduleHandler implements ActionHandler`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, Record<string, unknown> | null]>`

**`parseCallbackData.ts`**
  - `export function parseCallbackData(data: string):`

**`sendFollowUpMessage.ts`**
  - `export async function sendFollowUpMessage(botToken: string, chatId: string, text: string): Promise<boolean>`

**`services.ts`**
  - `export async function answerCallbackQuery(`
  - `export async function sendFollowUpMessage(`
  - `export async function updateBookingStatus(`
  - `export async function updateReminderPreferences(`
  - `export async function confirmBooking(`

**`types.ts`**
  - `export const InputSchema`
  - `export interface ActionContext`
  - `export interface ActionResult`
  - `export interface ActionHandler`

**`updateBookingStatus.ts`**
  - `export async function updateBookingStatus(tx: postgres.Sql, bookingId: string, newStatus: string, clientId: string | undefined, actor: string): Promise<[Error | null, boolean]>`

**`updateReminderPreferences.ts`**
  - `export async function updateReminderPreferences(tx: postgres.Sql, clientId: string, activate: boolean): Promise<[Error | null, boolean]>`

### `telegram_debug/`

### `telegram_gateway/`
> Main webhook handler for Telegram messages (routing + commands)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<`

**`services.ts`**
  - `export class TelegramClient implements ITelegramClient`
  - `export class ClientRepository implements IClientRepository`

**`types.ts`**
  - `export type TelegramUpdate`
  - `export type TelegramMessage`
  - `export type TelegramCallback`
  - `export interface SendMessageOptions`
  - `export interface ITelegramClient`
  - `export interface IClientRepository`
  - `export`

### `telegram_menu/`
> Display main menu with persistent reply keyboard

**`main.ts`**
  - `export function main(rawInput: unknown): MenuResult`

**`services.ts`**
  - `export const MAIN_MENU_KEYBOARD: string[][]`
  - `export const OPTION_MAP: Record<string, string>`
  - `export function parseUserOption(input: string): string | null`
  - `export function buildMainMenu(data:`
  - `export function handleShowMenu(input: Input)`
  - `export function handleSelectOption(input: Input)`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface MenuResult`

### `telegram_send/`
> Send/edit/delete Telegram messages + answer callback queries

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<TelegramSendData>>`

**`services.ts`**
  - `export class TelegramService`

**`types.ts`**
  - `export const InlineButtonSchema`
  - `export const SendMessageSchema`
  - `export const EditMessageSchema`
  - `export const DeleteMessageSchema`
  - `export const AnswerCallbackSchema`
  - `export const InputSchema`
  - `export type Input`
  - `export const TelegramResponseSchema`

### `web_admin_dashboard/`
> Admin stats and system overview KPIs

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<AdminDashboardResult>>`

**`services.ts`**
  - `export async function fetchDashboardStats(tx: TxClient, input: Input): Promise<Result<AdminDashboardResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface AdminDashboardResult`

### `web_admin_provider_crud/`
> Full provider management for admin dashboard (CRUD + activate/deactivate)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, unknown]>`

**`services.ts`**
  - `export async function listProviders(tx: postgres.Sql): Promise<Result<ProviderRow[]>>`
  - `export async function createProvider(`
  - `export async function updateProvider(`
  - `export async function resetProviderPassword(`

**`types.ts`**
  - `export const ActionSchema`
  - `export const InputSchema`
  - `export type Input`
  - `export interface ProviderRow`
  - `export interface CreateProviderResult extends ProviderRow`

### `web_admin_regions/`
> Read-only reference data for regions and communes

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<unknown>>`

**`services.ts`**
  - `export async function listRegions(sql: Sql): Promise<Result<`
  - `export async function listCommunes(sql: Sql, regionId?: number): Promise<Result<`
  - `export async function searchCommunes(sql: Sql, search: string, regionId?: number): Promise<Result<`

**`types.ts`**
  - `export const ActionSchema`
  - `export const InputSchema`
  - `export type Input`
  - `export interface RegionRow`
  - `export interface CommuneRow`

### `web_admin_specialties_crud/`
> Manage medical specialties (CRUD + activate/deactivate)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<unknown>>`

**`services.ts`**
  - `export const SpecialtyRepository`
  - `export const Handlers: Readonly<Record<z.infer<typeof ActionSchema>, ActionHandler>>`

**`types.ts`**
  - `export const ActionSchema`
  - `export const InputSchema`
  - `export type Input`
  - `export interface SpecialtyRow`

### `web_admin_tags/`
> Admin CRUD for tag categories and tags

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<unknown>>`

**`services.ts`**
  - `export async function verifyAdminAccess(`
  - `export const TagRepository`
  - `export async function handleAction(`

**`types.ts`**
  - `export const ActionSchema`
  - `export const InputSchema`
  - `export type TagInput`
  - `export interface CategoryRow`
  - `export interface TagRow`

### `web_admin_users/`
> User management CRUD + role change (admin-only)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, UserInfo | UsersListResult | null]>`

**`types.ts`**
  - `export const InputSchema`
  - `export interface UserInfo`
  - `export interface UsersListResult`

### `web_auth_change_role/`
> Admin-only user role change

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<ChangeRoleResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface ChangeRoleResult`

### `web_auth_complete_profile/`
> Complete profile for Telegram-registered user via web

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<CompleteProfileResult>>`

**`services.ts`**
  - `export function validateRut(rut: string): Result<void>`
  - `export function hashPasswordScrypt(password: string): string`
  - `export async function withAdminContext<T>(`

**`types.ts`**
  - `export const InputSchema`
  - `export interface CompleteProfileResult`
  - `export interface UserRow`

### `web_auth_login/`
> Authenticate email+password, return session + role

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<LoginResult>>`

**`types.ts`**
  - `export type Input`
  - `export interface LoginResult`
  - `export interface UserRow`
  - `export const InputSchema`

**`verifyPasswordSync.ts`**
  - `export function verifyPasswordSync(password: string, storedHash: string): boolean`

**`withAdminContext.ts`**
  - `export async function withAdminContext<T>(client: postgres.Sql, operation: (tx: postgres.Sql)`

### `web_auth_me/`
> Get current user profile + role by user_id

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<UserProfileResult>>`

**`services.ts`**
  - `export async function getUserProfile(tx: TxClient, userId: string): Promise<Result<UserProfileResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface UserProfileResult`

### `web_auth_register/`
> Register new user via web (hash password, validate RUT)

**`getGlobalTx.ts`**
  - `export async function getGlobalTx<T>(client: postgres.Sql, operation: (tx: postgres.Sql)`

**`hashPasswordSync.ts`**
  - `export function hashPasswordSync(password: string): string`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<[Error | null, RegisterResult | null]>`

**`types.ts`**
  - `export type Result<T>`
  - `export interface RegisterResult`
  - `export const InputSchema`

**`validatePasswordStrength.ts`**
  - `export function validatePasswordStrength(password: string): string | null`

**`validateRut.ts`**
  - `export function validateRut(rut: string): boolean`

### `web_booking_api/`
> Web Booking API orchestrator (crear/cancelar/reagendar)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<BookingResult>>`

**`repository.ts`**
  - `export async function resolveTenantForBooking(sql: DB, bookingId: string): Promise<Result<string>>`
  - `export async function resolveClientId(tx: DB, userId: string): Promise<Result<string>>`
  - `export async function lockProvider(tx: DB, providerId: string): Promise<Result<boolean>>`
  - `export async function getServiceDuration(tx: DB, serviceId: string): Promise<Result<number>>`
  - `export async function checkOverlap(tx: DB, providerId: string, startTime: string, endTime: string, ignoreBookingId?: string): Promise<Result<boolean>>`
  - `export async function insertBooking(tx: DB, data:`
  - `export async function updateBookingStatus(tx: DB, bookingId: string, status: string, reason?: string): Promise<Result<boolean>>`
  - `export async function getBooking(tx: DB, bookingId: string): Promise<Result<`

**`service.ts`**
  - `export async function crear(tx: DB, tenantId: string, clientId: string, input: Input): Promise<Result<BookingResult>>`
  - `export async function cancelar(tx: DB, clientId: string, input: Input): Promise<Result<BookingResult>>`
  - `export async function reagendar(tx: DB, tenantId: string, clientId: string, input: Input): Promise<Result<BookingResult>>`

**`types.ts`**
  - `export type Input`
  - `export type DB`
  - `export interface BookingResult`
  - `export const InputSchema`

**`utils.ts`**
  - `export function deriveIdempotencyKey(prefix: string, parts: readonly string[]): string`
  - `export function calculateEndTime(startTimeStr: string, durationMinutes: number): Result<string>`

### `web_patient_bookings/`
> Client booking history and upcoming appointments

**`fetchBookingsData.ts`**
  - `export async function fetchBookingsData(tx: TxClient, clientId: string, input: InputParams): Promise<Result<`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<BookingsResult>>`

**`resolveClientId.ts`**
  - `export async function resolveClientId(tx: TxClient, userId: string): Promise<Result<string>>`

**`services.ts`**
  - `export class PatientBookingService`

**`types.ts`**
  - `export const InputSchema`
  - `export type InputParams`
  - `export interface BookingInfo`
  - `export interface BookingsResult`
  - `export type RawBookingRow`

### `web_patient_profile/`
> Client profile CRUD (get/update)

**`findOrCreateClient.ts`**
  - `export async function findOrCreateClient(tx: TxClient, userId: string, user: postgres.Row): Promise<Result<postgres.Row>>`

**`findUser.ts`**
  - `export async function findUser(tx: TxClient, userId: string): Promise<Result<postgres.Row>>`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<ProfileResult>>`

**`mapToProfileResult.ts`**
  - `export function mapToProfileResult(row: postgres.Row): ProfileResult`

**`types.ts`**
  - `export type Input`
  - `export interface ProfileResult`
  - `export const InputSchema`

**`updateProfile.ts`**
  - `export async function updateProfile(tx: TxClient, clientId: string, data: Partial<Omit<Input, 'user_id' | 'action'>>): Promise<Result<postgres.Row>>`

### `web_provider_dashboard/`
> Provider stats + agenda for

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<DashboardResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface AgendaItem`
  - `export interface ProviderStats`
  - `export interface DashboardResult`

### `web_provider_notes/`
> Clinical notes CRUD with AES-256-GCM encryption at rest

**`decryptContent.ts`**
  - `export function decryptContent(encrypted: string | null): string`

**`encryptContent.ts`**
  - `export function encryptContent(plainContent: string):`

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<unknown>>`

**`mapRowToNote.ts`**
  - `export function mapRowToNote(row: Record<string, unknown>, tags: readonly Tag[]`

**`types.ts`**
  - `export type Input`
  - `export type HandlerResult`
  - `export interface Tag`
  - `export interface NoteRow`
  - `export const InputSchema`

### `web_provider_profile/`
> Provider self-service profile management (get/update/change password)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<unknown>>`

**`types.ts`**
  - `export type ProfileInput`
  - `export type ProfileActionHandler`
  - `export interface ProfileRow`
  - `export const InputSchema`

### `web_waitlist/`
> Waitlist management (join, leave, list, check position)

**`main.ts`**
  - `export async function main(rawInput: unknown): Promise<Result<WaitlistResult>>`

**`services.ts`**
  - `export async function resolveClientId(tx: postgres.Sql, userId: string, inputClientId?: string): Promise<Result<string>>`
  - `export async function handleJoin(tx: postgres.Sql, clientId: string, data: Input): Promise<Result<WaitlistResult>>`
  - `export async function handleLeave(tx: postgres.Sql, clientId: string, waitlistId?: string): Promise<Result<WaitlistResult>>`
  - `export async function handleList(tx: postgres.Sql, clientId: string): Promise<Result<WaitlistResult>>`
  - `export async function handleCheckPosition(tx: postgres.Sql, clientId: string, waitlistId?: string): Promise<Result<WaitlistResult>>`

**`types.ts`**
  - `export const InputSchema`
  - `export type Input`
  - `export interface WaitlistEntry`
  - `export interface WaitlistResult`
  - `export const WaitlistResultSchema`


---

**Stats:** 58 módulos | 275 archivos TypeScript (excl. tests)
