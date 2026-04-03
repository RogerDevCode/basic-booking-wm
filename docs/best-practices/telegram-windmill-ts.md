# Telegram Bot API con Windmill y TypeScript - Best Practices

## Webhook Setup y Validación

### Configurar Webhook con Secret Token

```bash
# Setup del webhook con secret_token (Bot API 7.6+)
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://windmill.stax.ink/api/telegram/webhook",
    "secret_token": "your-secret-token-here",
    "allowed_updates": ["message", "channel_post", "callback_query"]
  }'
```

### Validar Secret Token en TypeScript

```typescript
import { createHash } from "node:crypto";

function validateSecretToken(receivedToken: string, expectedToken: string): boolean {
  if (receivedToken.length !== expectedToken.length) {
    return false;
  }

  // Constant-time comparison para prevenir timing attacks
  const a = createHash("sha256").update(receivedToken).digest();
  const b = createHash("sha256").update(expectedToken).digest();

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}
```

### Webhook Handler en Windmill

```typescript
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      first_name?: string;
    };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
    };
    message: {
      message_id: number;
      chat: {
        id: number;
      };
    };
    data: string;
  };
}

export async function main(
  update: TelegramUpdate,
  secretToken: string,
): Promise<Result<Readonly<Record<string, unknown>>>> {
  // Validar secret token (Windmill lo inyecta desde el webhook header)
  const receivedToken = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!validateSecretToken(receivedToken, secretToken)) {
    return [new Error("Invalid webhook secret token"), null];
  }

  // Extraer datos del update
  if (update.message == null && update.callback_query == null) {
    return [new Error("Unsupported update type"), null];
  }

  const chatId = update.message?.chat.id ?? update.callback_query?.message.chat.id;
  const text = update.message?.text ?? update.callback_query?.data;
  const userId = update.message?.from.id ?? update.callback_query?.from.id;
  const username = update.message?.from.first_name ?? update.callback_query?.from.first_name;

  if (chatId == null || userId == null) {
    return [new Error("Missing chat or user information"), null];
  }

  // Procesar mensaje
  const [err, response] = await processMessage(chatId, text ?? "", String(userId), username ?? "User");
  if (err != null) {
    return [err, null];
  }

  return [null, { status: "processing", chat_id: chatId }];
}
```

### Verificar Webhook

```bash
# Verificar estado
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"

# Respuesta esperada:
{
  "ok": true,
  "result": {
    "url": "https://windmill.stax.ink/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "allowed_updates": ["message", "channel_post"]
  }
}
```

## Rate Limiting

### Límites de Telegram

| Tipo | Límite | Cuándo Aplica |
|------|--------|---------------|
| **Global** | 30 msg/s | Diferentes chats |
| **Mismo chat** | 1 msg/s | Mismo usuario/chat |
| **Broadcast pagado** | 1000 msg/s | Con Telegram Stars |

### Error 429 Handling

```typescript
interface TelegramErrorResponse {
  ok: boolean;
  error_code: number;
  description: string;
  parameters?: {
    retry_after: number;
  };
}

async function sendMessageWithRetry(
  chatId: number | string,
  text: string,
  parseMode: string | null = null,
  maxRetries: number = 3,
): Promise<Result<null>> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const [err] = await sendMessage(chatId, text, parseMode);

    if (err == null) {
      return [null, null];
    }

    // Verificar si es rate limit
    if (isRateLimitError(err)) {
      const retryAfter = extractRetryAfter(err) ?? 60;
      console.log(`Rate limited, waiting ${retryAfter} seconds`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    // Error no recuperable
    return [err, null];
  }

  return [new Error("Max retries exceeded for Telegram message"), null];
}

function isRateLimitError(err: Error): boolean {
  return err.message.includes("429") || err.message.includes("retry_after");
}

function extractRetryAfter(err: Error): number | null {
  const match = err.message.match(/retry_after\s+(\d+)/);
  if (match != null) {
    return parseInt(match[1], 10);
  }
  return null;
}
```

### Token Bucket Rate Limiter

```typescript
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxTokens: number, refillRate: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  async wait(): Promise<void> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    const waitTime = (1 / this.refillRate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    this.refill();
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// Rate limiter global (30 msg/s)
const globalLimiter = new RateLimiter(30, 30);

// Rate limiter por chat (1 msg/s)
const chatLimiters = new Map<string, RateLimiter>();

function getChatLimiter(chatId: string): RateLimiter {
  if (!chatLimiters.has(chatId)) {
    chatLimiters.set(chatId, new RateLimiter(5, 1)); // burst de 5, 1 msg/s
  }
  return chatLimiters.get(chatId)!;
}

async function sendMessageWithRateLimit(
  chatId: number | string,
  text: string,
  parseMode: string | null = null,
): Promise<Result<null>> {
  // Esperar token global
  await globalLimiter.wait();

  // Esperar token del chat
  const chatLimiter = getChatLimiter(String(chatId));
  await chatLimiter.wait();

  // Enviar mensaje
  return sendMessage(chatId, text, parseMode);
}
```

### Cola de Mensajes (Queue)

```typescript
interface QueuedMessage {
  chatId: number | string;
  text: string;
  parseMode: string | null;
  retry: number;
}

class MessageQueue {
  private queue: QueuedMessage[] = [];
  private processing = false;

  constructor(private workers: number) {}

  async send(chatId: number | string, text: string, parseMode: string | null = null): Promise<void> {
    this.queue.push({ chatId, text, parseMode, retry: 0 });

    if (!this.processing) {
      void this.process();
    }
  }

  private async process(): Promise<void> {
    this.processing = true;

    const promises: Promise<void>[] = [];

    for (let i = 0; i < this.workers; i++) {
      promises.push(this.worker());
    }

    await Promise.allSettled(promises);
    this.processing = false;
  }

  private async worker(): Promise<void> {
    while (this.queue.length > 0) {
      const msg = this.queue.shift();
      if (msg == null) break;

      const [err] = await sendMessageWithRetry(msg.chatId, msg.text, msg.parseMode);

      if (err != null && msg.retry < 3) {
        msg.retry++;
        this.queue.push(msg);
        await new Promise((resolve) => setTimeout(resolve, msg.retry * 1000));
      }
    }
  }
}

// Uso global
const messageQueue = new MessageQueue(3); // 3 workers

// En cualquier parte del código:
await messageQueue.send(chatId, "Mensaje a enviar");
```

## MarkdownV2 Formatting

### Caracteres Especiales a Escapear

```typescript
const MARKDOWN_V2_SPECIAL_CHARS = [
  "_", "*", "[", "]", "(", ")", "~",
  "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!",
];

function escapeMarkdownV2(text: string): string {
  let escaped = text;
  for (const char of MARKDOWN_V2_SPECIAL_CHARS) {
    escaped = escaped.replaceAll(char, `\\${char}`);
  }
  return escaped;
}
```

### Formateo de Mensajes

```typescript
interface Booking {
  id: string;
  providerName: string;
  serviceName: string;
  startTime: string;
}

function formatBookingConfirmation(booking: Readonly<Booking>): string {
  const escapedId = escapeMarkdownV2(booking.id);
  const escapedProvider = escapeMarkdownV2(booking.providerName);
  const escapedService = escapeMarkdownV2(booking.serviceName);
  const escapedTime = escapeMarkdownV2(booking.startTime);

  return `✅ *Reserva Confirmada*

📋 *Detalles:*
ID de Reserva: \`${escapedId}\`
Proveedor: ${escapedProvider}
Servicio: ${escapedService}
Fecha: ${escapedTime}

Gracias por confiar en nosotros\\! 🎉`;
}

async function sendBookingConfirmation(
  chatId: number | string,
  booking: Readonly<Booking>,
): Promise<Result<null>> {
  const text = formatBookingConfirmation(booking);
  return sendMessageWithRateLimit(chatId, text, "MarkdownV2");
}
```

### Ejemplos de Formatting

```typescript
// Bold
const bold = `*texto en negrita*`;

// Italic
const italic = `_texto en cursiva_`;

// Underline
const underline = `__texto subrayado__`;

// Strikethrough
const strikethrough = `~texto tachado~`;

// Inline code
const inlineCode = `\`código inline\``;

// Code block
const codeBlock = `\`\`\`
bloque de código
\`\`\``;

// Link
const link = `[texto](https://example.com)`;

// Mention
const mention = `[@username](tg://user?id=${userId})`;

// Ejemplo combinado
const message = `*Nuevo Booking*

Cliente: _${escapeMarkdownV2(clientName)}_
Fecha: \`${date}\`
[Ver detalles](https://example.com/booking/${bookingId})`;
```

## Parseo de Mensajes

### Estructura de Update

```typescript
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string; // "private", "group", "supergroup", "channel"
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_to_message?: TelegramMessage;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message: {
    message_id: number;
    chat: { id: number };
  };
  data: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: unknown;
}
```

### Extractor de Datos

```typescript
interface MessageData {
  chatId: number;
  chatType: string;
  userId: number;
  username: string;
  text: string;
  messageId: number;
  date: Date;
}

function parseTelegramUpdate(update: TelegramUpdate): Result<MessageData> {
  let msg: TelegramMessage | undefined;

  // Determinar tipo de mensaje
  if (update.message != null) {
    msg = update.message;
  } else if (update.edited_message != null) {
    msg = update.edited_message;
  } else if (update.channel_post != null) {
    msg = update.channel_post;
  } else {
    return [new Error("Unsupported update type"), null];
  }

  // Validar campos requeridos
  if (msg.chat == null) {
    return [new Error("Missing chat information"), null];
  }

  const from = msg.from;
  if (from == null) {
    return [new Error("Missing user information"), null];
  }

  return [null, {
    chatId: msg.chat.id,
    chatType: msg.chat.type,
    userId: from.id,
    username: from.first_name,
    text: msg.text ?? "",
    messageId: msg.message_id,
    date: new Date(msg.date * 1000),
  }];
}
```

## Flujo de Conversación (Conversation Flow)

### Máquina de Estados

```typescript
type ConversationState =
  | "idle"
  | "selecting_provider"
  | "selecting_service"
  | "selecting_time"
  | "confirming";

interface UserSession {
  chatId: string;
  state: ConversationState;
  providerId?: string;
  serviceId?: string;
  startTime?: string;
  createdAt: string;
  expiresAt: string;
}

// Storage en Redis
async function getSession(
  redis: Redis,
  chatId: string,
): Promise<Result<UserSession | null>> {
  const key = `session:${chatId}`;

  try {
    const data = await redis.get(key);
    if (data == null) {
      return [null, null];
    }

    const session = JSON.parse(data) as UserSession;

    // Verificar expiración
    if (new Date() > new Date(session.expiresAt)) {
      await redis.del(key);
      return [null, null];
    }

    return [null, session];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function setSession(
  redis: Redis,
  chatId: string,
  session: UserSession,
): Promise<Result<null>> {
  const key = `session:${chatId}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // TTL 30 min

  session.expiresAt = expiresAt.toISOString();

  try {
    await redis.set(key, JSON.stringify(session), "EX", 1800);
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Handler de Estados

```typescript
async function handleConversation(
  chatId: string,
  text: string,
): Promise<Result<null>> {
  const [sessionErr, sessionData] = await getSession(redis, chatId);
  if (sessionErr != null) return [sessionErr, null];

  const session: UserSession = sessionData ?? {
    chatId,
    state: "idle",
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  };

  switch (session.state) {
    case "idle":
      return handleIdleState(session, text);
    case "selecting_provider":
      return handleSelectingProviderState(session, text);
    case "selecting_service":
      return handleSelectingServiceState(session, text);
    case "selecting_time":
      return handleSelectingTimeState(session, text);
    case "confirming":
      return handleConfirmingState(session, text);
    default:
      session.state = "idle";
      return setSession(redis, chatId, session);
  }
}

async function handleIdleState(
  session: UserSession,
  text: string,
): Promise<Result<null>> {
  const intent = detectIntent(text);

  if (intent === "create_appointment") {
    const [err, providers] = await getProviders();
    if (err != null) return [err, null];

    let message = "📋 *Selecciona un proveedor:*\\n\\n";
    for (let i = 0; i < providers.length; i++) {
      message += `${i + 1}\\. ${escapeMarkdownV2(providers[i].name)}\\n`;
    }

    await sendMessageWithRateLimit(session.chatId, message, "MarkdownV2");

    session.state = "selecting_provider";
    return setSession(redis, session.chatId, session);
  }

  await sendMessageWithRateLimit(
    session.chatId,
    "👋 Hola\\! Soy tu asistente de reservas\\.\\n\\n¿Qué te gustaría hacer?\\n\\- Reservar una cita\\n\\- Ver disponibilidad\\n\\- Cancelar reserva",
    "MarkdownV2",
  );

  return [null, null];
}

async function handleConfirmingState(
  session: UserSession,
  text: string,
): Promise<Result<null>> {
  const normalizedText = text.toLowerCase();

  if (normalizedText === "confirmar" || normalizedText === "si" || normalizedText === "sí") {
    if (session.providerId == null || session.serviceId == null || session.startTime == null) {
      return [new Error("Missing booking data"), null];
    }

    const [err, booking] = await createBooking(session.providerId, session.serviceId, session.startTime);
    if (err != null) {
      await sendMessageWithRateLimit(
        session.chatId,
        "❌ Error al crear la reserva\\. Inténtalo de nuevo\\.",
        "MarkdownV2",
      );
      return [err, null];
    }

    await sendBookingConfirmation(session.chatId, booking);

    session.state = "idle";
    session.providerId = undefined;
    session.serviceId = undefined;
    session.startTime = undefined;
    return setSession(redis, session.chatId, session);
  }

  await sendMessageWithRateLimit(
    session.chatId,
    "❌ Reserva cancelada\\. ¿Qué más puedo ayudarte?",
    "MarkdownV2",
  );

  session.state = "idle";
  return setSession(redis, session.chatId, session);
}
```

### Timeout de Sesión

```typescript
async function handleSessionTimeout(chatId: string): Promise<Result<null>> {
  const message = "⏰ *Sesión Expirada*\\n\\n" +
    "Tu sesión ha expirado por inactividad\\.\\n" +
    "Por favor inicia el proceso de nuevo\\.\\n\\n" +
    "Escribe /start para comenzar\\.";

  return sendMessageWithRateLimit(chatId, message, "MarkdownV2");
}
```

## Errores Comunes

### ❌ No Validar Secret Token

```typescript
// MAL: Sin validación
export async function main(update: TelegramUpdate) {
  // Cualquiera puede enviar requests falsos!
}

// BIEN: Con validación
export async function main(update: TelegramUpdate, secretToken: string) {
  const receivedToken = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!validateSecretToken(receivedToken, secretToken)) {
    return [new Error("Unauthorized"), null];
  }
}
```

### ❌ No Manejar Rate Limits

```typescript
// MAL: Enviar sin control
for (const chatId of chatIds) {
  await sendMessage(chatId, message); // Puede causar 429!
}

// BIEN: Con rate limiter
for (const chatId of chatIds) {
  await globalLimiter.wait();
  await sendMessage(chatId, message);
}
```

### ❌ No Escapear MarkdownV2

```typescript
// MAL: Texto sin escape
const text = `*${userName}*`; // Si userName tiene "*", rompe formatting

// BIEN: Con escape
const text = `*${escapeMarkdownV2(userName)}*`;
```

### ❌ No Manejar Sesiones

```typescript
// MAL: Sin estado, cada mensaje es independiente
function handleMessage(chatId: string, text: string) {
  // No sabe en qué paso del flujo está el usuario
}

// BIEN: Con máquina de estados
async function handleMessage(chatId: string, text: string) {
  const [err, session] = await getSession(redis, chatId);
  if (err == null && session != null) {
    switch (session.state) {
      // ...
    }
  }
}
```

## Checklist Producción

- [ ] Webhook con secret_token configurado
- [ ] Validación de header X-Telegram-Bot-Api-Secret-Token
- [ ] HTTPS obligatorio en webhook URL
- [ ] Rate limiter global (30 msg/s) y por chat (1 msg/s)
- [ ] Manejo de error 429 con retry_after
- [ ] Cola de mensajes para broadcasts
- [ ] Función escapeMarkdownV2 para todo texto de usuario
- [ ] Máquina de estados para conversación
- [ ] Sesiones en Redis con TTL (30 min)
- [ ] Timeout de sesión con notificación
- [ ] Logging estructurado de errores
- [ ] Monitoreo de tasa de entrega
