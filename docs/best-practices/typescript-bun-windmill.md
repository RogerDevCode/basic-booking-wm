# Scripts TypeScript con Bun en Windmill - Best Practices

## Estructura de Script Bun

### Main Function Signature

```typescript
// Import estándar
import * as wmill from "windmill-client";

// Función main exportada (required)
export async function main(
  // Parámetros del script
  name: string,
  count: number,
  // Resources tipados con RT namespace
  db: RT.Postgresql,
  telegram: RT.Telegram,
): Promise<Map<String, any>> {
  // Lógica del script
  console.log(`Hello ${name}`);
  
  // Retornar resultado (JSON serializable)
  return {
    success: true,
    message: `Processed ${count} items`,
  };
}
```

### Preprocessor para Webhooks

```typescript
// Preprocessor: transforma el evento webhook en parámetros para main
export async function preprocessor(event: Event) {
  // Event structure
  // event.kind: "webhook" | "http" | "websocket" | "kafka" | "nats" | etc.
  // event.body: any
  // event.headers: Record<string, string>
  // event.query: Record<string, string>
  
  // Parsear payload de Telegram
  const payload = event.body;
  
  // Extraer datos del mensaje
  const message = payload.message || payload.channel_post;
  const chatId = message?.chat?.id;
  const text = message?.text;
  const username = message?.from?.first_name;
  
  // Validar
  if (!chatId || !text) {
    throw new Error("Invalid Telegram message");
  }
  
  // Retornar parámetros para main
  return {
    chat_id: chatId.toString(),
    text: text,
    username: username || "Unknown",
  };
}

// Main recibe los parámetros del preprocessor
export async function main(
  chat_id: string,
  text: string,
  username: string,
) {
  // Procesar mensaje
  console.log(`Message from ${username}: ${text}`);
  
  return { processed: true };
}
```

## RT Namespace y Resource Types

### Importar y Usar RT

```typescript
// Generar rt.d.ts con CLI
// wmill resource-type generate-namespace

import * as wmill from "windmill-client";

// Resources como parámetros (type-safe)
export async function main(
  db: RT.Postgresql,
  redis: RT.Redis,
  groq: RT.Groq,
) {
  // Obtener connection string desde resource
  const dbUrl = await wmill.databaseUrlFromResource(db);
  
  // Conectar a PostgreSQL
  const client = new Client(dbUrl);
  await client.connect();
  
  // Conectar a Redis
  const redisClient = createClient({ url: redis.url });
  await redisClient.connect();
  
  // Usar Groq API
  const response = await fetch(groq.base_url || "https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groq.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Hello" }],
    }),
  });
  
  return { success: true };
}
```

### Tipos RT Disponibles

```typescript
declare namespace RT {
  type Postgresql = {
    host: string;
    port: number;
    user: string;
    password: string;
    dbname: string;
    sslmode: string;
    root_certificate_pem?: string;
  };

  type Redis = {
    url: string;
    password?: string;
    db?: number;
    tls?: boolean;
  };

  type Telegram = {
    bot_token: string;
  };

  type Gcal = {
    token: string;
  };

  type Gmail = {
    token: string;
  };

  type Groq = {
    api_key: string;
    base_url?: string;
  };

  type Openai = {
    api_key: string;
    base_url?: string;
    organization_id?: string;
  };

  type S3 = {
    endpoint: string;
    bucket: string;
    access_key: string;
    secret_key: string;
    region: string;
  };
}
```

## Parseo de Mensajes Telegram

### Interfaces TypeScript

```typescript
// Telegram Bot API types
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}
```

### Preprocessor Completo

```typescript
export async function preprocessor(event: Event) {
  // Validar que es webhook
  if (event.kind !== "webhook") {
    throw new Error("Expected webhook event");
  }
  
  const payload = event.body as TelegramUpdate;
  
  // Extraer mensaje (puede ser message o channel_post)
  const message = payload.message || payload.channel_post;
  
  if (!message) {
    throw new Error("No message in payload");
  }
  
  // Validar campos requeridos
  if (!message.chat || !message.chat.id) {
    throw new Error("Invalid chat information");
  }
  
  // Extraer datos
  const chatId = message.chat.id.toString();
  const chatType = message.chat.type;
  const text = message.text || "";
  const username = message.from?.first_name || "Unknown";
  const userId = message.from?.id?.toString() || "";
  
  // Detectar comandos
  const command = text.startsWith("/") ? text.split(" ")[0] : null;
  
  return {
    chat_id: chatId,
    chat_type: chatType,
    text: text,
    username: username,
    user_id: userId,
    command: command,
    message_id: message.message_id.toString(),
    date: new Date(message.date * 1000).toISOString(),
  };
}
```

### Main Handler

```typescript
export async function main(
  chat_id: string,
  chat_type: string,
  text: string,
  username: string,
  user_id: string,
  command: string | null,
  message_id: string,
  telegram: RT.Telegram,
) {
  // Logging
  console.log(`[${chat_type}] ${username}: ${text}`);
  
  // Routing por comando
  if (command) {
    switch (command) {
      case "/start":
        return await handleStart(chat_id, username);
      case "/help":
        return await handleHelp(chat_id);
      case "/book":
        return await handleBooking(chat_id, text);
      default:
        return await sendUnknownCommand(chat_id, command);
    }
  }
  
  // Mensaje normal: detectar intención con AI
  return await handleNaturalLanguage(chat_id, text, username);
}

async function handleStart(chat_id: string, username: string) {
  const text = `👋 ¡Hola ${username}! Bienvenido a Booking Titanium.

Escribe /help para ver los comandos disponibles o simplemente dime qué necesitas.`;
  
  await sendTelegramMessage(chat_id, text);
  
  return { handled: true, type: "start" };
}

async function handleBooking(chat_id: string, text: string) {
  // Extraer entidades del mensaje
  const entities = extractBookingEntities(text);
  
  if (!entities.provider_id || !entities.service_id) {
    await sendTelegramMessage(
      chat_id,
      "Por favor especifica proveedor y servicio. Ej: /book proveedor 1 servicio 1 para mañana 3pm"
    );
    return { handled: false, error: "Missing entities" };
  }
  
  // Crear booking
  const booking = await createBooking(entities);
  
  await sendTelegramMessage(
    chat_id,
    `✅ Reserva confirmada\nID: ${booking.id}\nFecha: ${booking.start_time}`
  );
  
  return { handled: true, type: "booking", booking_id: booking.id };
}
```

## Estructura de Módulos

### Shared Logic (Sin Main)

```typescript
// f/common/telegram-utils.ts
// Script SIN main = módulo compartido

import * as wmill from "windmill-client";

// Funciones utilitarias exportables
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: "MarkdownV2" | "HTML" | null = "MarkdownV2",
) {
  const token = await wmill.getVariable("u/admin/telegram-bot-token");
  
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: parseMode,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Telegram API error: ${error.description}`);
  }
  
  return await response.json();
}

export function escapeMarkdownV2(text: string): string {
  const specialChars = /([_*\[\]()~>#+\-=|{}.!\\])/g;
  return text.replace(specialChars, "\\$1");
}

export function extractBookingEntities(text: string): {
  provider_id?: number;
  service_id?: number;
  date?: string;
  time?: string;
} {
  const entities: any = {};
  
  // Extraer "proveedor X" o "provider X"
  const providerMatch = text.match(/proveedor|provider\s*(\d+)/i);
  if (providerMatch) {
    entities.provider_id = parseInt(providerMatch[1]);
  }
  
  // Extraer "servicio X" o "service X"
  const serviceMatch = text.match(/servicio|service\s*(\d+)/i);
  if (serviceMatch) {
    entities.service_id = parseInt(serviceMatch[1]);
  }
  
  // Extraer fecha/hora
  const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  if (dateMatch) {
    entities.date = dateMatch[1];
  }
  
  const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(am|pm)?)/i);
  if (timeMatch) {
    entities.time = timeMatch[1];
  }
  
  return entities;
}
```

### Importar Módulos Compartidos

```typescript
// f/telegram-webhook__flow/handler.ts
import { 
  sendTelegramMessage, 
  escapeMarkdownV2,
  extractBookingEntities 
} from "../common/telegram-utils.ts";

export async function main(chat_id: string, text: string) {
  // Usar funciones compartidas
  const entities = extractBookingEntities(text);
  
  await sendTelegramMessage(
    chat_id,
    `Procesando: ${escapeMarkdownV2(text)}`
  );
  
  return { entities };
}
```

## Tipado Estricto

### TypeScript Config

```json
// tsconfig.json (para desarrollo local)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["f/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Tipos Personalizados

```typescript
// f/types/booking.ts
export interface BookingData {
  provider_id: number;
  service_id: number;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  chat_id: string;
  user_name: string;
  user_email?: string;
}

export interface BookingResult {
  id: string;
  status: "confirmed" | "pending" | "cancelled";
  gcal_event_id?: string;
  created_at: string;
}

export interface IntentDetection {
  intent: 
    | "create_appointment"
    | "cancel_appointment"
    | "reschedule_appointment"
    | "check_availability"
    | "greeting"
    | "unknown";
  entities: Partial<BookingData>;
  confidence: number; // 0.0 - 1.0
  response: string;
}

// Funciones tipadas
export async function createBooking(
  data: BookingData
): Promise<BookingResult> {
  // Implementación
}

export async function detectIntent(
  text: string,
  context: string[]
): Promise<IntentDetection> {
  // Implementación
}
```

## Manejo de Errores

### Try-Catch con Logging

```typescript
export async function main(chat_id: string, text: string) {
  try {
    // Operación que puede fallar
    const result = await processMessage(chat_id, text);
    return { success: true, result };
  } catch (error) {
    // Log error completo
    console.error("Error processing message:", {
      chat_id,
      text,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Notificar al usuario
    await sendTelegramMessage(
      chat_id,
      "❌ Ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo."
    );
    
    // Retornar error estructurado
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

### Error Types Personalizados

```typescript
// f/types/errors.ts
export class BookingError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

export class ValidationError extends BookingError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends BookingError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

// Uso
export async function main(chat_id: string, text: string) {
  try {
    const entities = extractBookingEntities(text);
    
    if (!entities.provider_id) {
      throw new ValidationError("Provider ID is required");
    }
    
    const provider = await getProvider(entities.provider_id);
    
    if (!provider) {
      throw new NotFoundError("Provider");
    }
    
    // ...
  } catch (error) {
    if (error instanceof BookingError) {
      // Error conocido, manejar gracefulmente
      await sendTelegramMessage(chat_id, `❌ ${error.message}`);
      return { success: false, error: error.code };
    }
    
    // Error desconocido, log y mensaje genérico
    console.error("Unexpected error:", error);
    await sendTelegramMessage(chat_id, "❌ Error interno. Por favor intenta más tarde.");
    return { success: false, error: "INTERNAL_ERROR" };
  }
}
```

## Testing Local con Bun

### Setup

```bash
# Instalar Bun (si no está instalado)
curl -fsSL https://bun.sh/install | bash

# Crear archivo de test
touch f/common/telegram-utils.test.ts
```

### Tests Unitarios

```typescript
// f/common/telegram-utils.test.ts
import { test, expect, mock } from "bun:test";
import { 
  escapeMarkdownV2, 
  extractBookingEntities 
} from "./telegram-utils.ts";

test("escapeMarkdownV2 escapes special characters", () => {
  const input = "Hello_World *test* [link](url)";
  const expected = "Hello\\_World \\*test\\* \\[link\\]\\(url\\)";
  
  expect(escapeMarkdownV2(input)).toBe(expected);
});

test("extractBookingEntities extracts provider_id", () => {
  const text = "Quiero reservar con el proveedor 3";
  const entities = extractBookingEntities(text);
  
  expect(entities.provider_id).toBe(3);
  expect(entities.service_id).toBeUndefined();
});

test("extractBookingEntities extracts service_id", () => {
  const text = "Necesito el servicio 5 para mañana";
  const entities = extractBookingEntities(text);
  
  expect(entities.service_id).toBe(5);
  expect(entities.provider_id).toBeUndefined();
});

test("extractBookingEntities extracts date and time", () => {
  const text = "Para el 15/04/2026 a las 3:00pm";
  const entities = extractBookingEntities(text);
  
  expect(entities.date).toBe("15/04/2026");
  expect(entities.time).toBe("3:00pm");
});
```

### Mock Functions

```typescript
// f/handlers/booking.test.ts
import { test, expect, mock } from "bun:test";
import { handleBooking } from "./booking.ts";

// Mock de sendTelegramMessage
const sendTelegramMessageMock = mock(async (chatId: string, text: string) => {
  return { success: true };
});

// Mock de createBooking
const createBookingMock = mock(async (entities: any) => {
  return { id: "BK-123", status: "confirmed" };
});

test("handleBooking sends confirmation message", async () => {
  // Configurar mocks
  sendTelegramMessageMock.mockImplementation(async () => ({ success: true }));
  createBookingMock.mockImplementation(async () => ({ id: "BK-123" }));
  
  // Ejecutar
  const result = await handleBooking("123456", "/book proveedor 1 servicio 1");
  
  // Assert
  expect(sendTelegramMessageMock).toHaveBeenCalled();
  expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1);
  expect(sendTelegramMessageMock.mock.calls[0][0]).toBe("123456");
  expect(createBookingMock).toHaveBeenCalled();
  expect(result.handled).toBe(true);
});

test("handleBooking shows error when missing entities", async () => {
  const result = await handleBooking("123456", "/book");
  
  expect(result.handled).toBe(false);
  expect(result.error).toBe("Missing entities");
  expect(sendTelegramMessageMock).toHaveBeenCalled();
});
```

### SpyOn

```typescript
import { test, expect, spyOn } from "bun:test";
import * as wmill from "windmill-client";

test("main uses wmill.getVariable", async () => {
  // Spy on wmill.getVariable
  const getVariableSpy = spyOn(wmill, "getVariable");
  getVariableSpy.mockResolvedValue("mocked-token");
  
  // Ejecutar script
  await main("chat123", "hello");
  
  // Verificar que se llamó
  expect(getVariableSpy).toHaveBeenCalled();
  expect(getVariableSpy).toHaveBeenCalledWith("u/admin/telegram-bot-token");
});
```

### Ejecutar Tests

```bash
# Ejecutar todos los tests
bun test

# Ejecutar test específico
bun test telegram-utils.test.ts

# Ejecutar con watch mode
bun test --watch

# Ejecutar con coverage
bun test --coverage
```

## Desarrollo Local

### Environment Variables

```bash
# .env (agregar a .gitignore)
BASE_INTERNAL_URL=https://app.windmill.dev
WM_TOKEN=wm_xxx
WM_WORKSPACE=booking-titanium
WM_STATE_PATH=f/common/telegram-utils
```

### VS Code Launch Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Script (Bun)",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "${file}"],
      "env": {
        "BASE_INTERNAL_URL": "https://app.windmill.dev",
        "WM_TOKEN": "${env:WM_TOKEN}",
        "WM_WORKSPACE": "booking-titanium"
      }
    },
    {
      "name": "Test Script (Bun)",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["test", "${file}"],
      "env": {
        "BASE_INTERNAL_URL": "https://app.windmill.dev",
        "WM_TOKEN": "${env:WM_TOKEN}",
        "WM_WORKSPACE": "booking-titanium"
      }
    }
  ]
}
```

### Ejecutar Script Localmente

```bash
# Con variables inline
BASE_INTERNAL_URL=https://app.windmill.dev \
WM_TOKEN=wm_xxx \
WM_WORKSPACE=booking-titanium \
bun run f/handlers/booking.ts

# O con .env file
source .env && bun run f/handlers/booking.ts
```

## Errores Comunes

### ❌ No Exportar Main

```typescript
// MAL: Sin export
async function main(name: string) {
  return { hello: name };
}

// BIEN: Exportar
export async function main(name: string) {
  return { hello: name };
}
```

### ❌ Olvidar RT Namespace

```typescript
// MAL: Sin tipado
export async function main(db) {
  // db es 'any', sin autocomplete
}

// BIEN: Con RT namespace
export async function main(db: RT.Postgresql) {
  // db tiene autocomplete y type checking
}
```

### ❌ No Manejar Errores

```typescript
// MAL: Sin try-catch
export async function main(chat_id: string, text: string) {
  const result = await processMessage(chat_id, text);
  return result; // Si falla, error sin manejar
}

// BIEN: Con try-catch
export async function main(chat_id: string, text: string) {
  try {
    const result = await processMessage(chat_id, text);
    return { success: true, result };
  } catch (error) {
    console.error("Error:", error);
    return { success: false, error: error.message };
  }
}
```

### ❌ Tests Sin Mocks

```typescript
// MAL: Test llama API real
test("send message", async () => {
  await sendTelegramMessage("123", "hello"); // ¡Llama API real!
});

// BIEN: Test con mocks
test("send message", async () => {
  const mock = mock(async () => ({ success: true }));
  // Usar mock en lugar de función real
});
```

## Checklist Producción

- [ ] Main function exportada correctamente
- [ ] Parámetros tipados con RT namespace
- [ ] Preprocessor para webhooks (si aplica)
- [ ] Manejo de errores con try-catch
- [ ] Logging estructurado (console.log/error)
- [ ] Tests unitarios con bun test
- [ ] Mocks para dependencias externas
- [ ] Shared logic en módulos sin main
- [ ] Imports relativos correctos (.ts para Deno, opcional para Bun)
- [ ] tsconfig.json con strict mode
- [ ] .env para desarrollo local
- [ ] Launch configuration para VS Code/JetBrains
