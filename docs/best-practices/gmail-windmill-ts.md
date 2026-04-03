# Gmail API con TypeScript y OAuth2 Service Account - Best Practices

## Autenticación OAuth2

### Service Account vs App Password

| Método | Cuándo Usar | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **Service Account** | Producción, apps empresariales | Sin intervención usuario, domain-wide delegation, más seguro | Requiere Google Workspace, setup más complejo |
| **App Password** | Testing, uso personal | Simple, rápido de configurar | Requiere 2FA, menos seguro, limitado a cuentas personales |

### Setup de Service Account

```bash
# 1. Crear Service Account en Google Cloud Console
# IAM & Admin > Service Accounts > Create Service Account

# 2. Habilitar Gmail API
# APIs & Services > Library > Gmail API > Enable

# 3. Crear clave JSON
# Service Account > Keys > Add Key > Create New Key > JSON

# 4. Domain-wide Delegation (si envías en nombre de usuarios)
# Service Account > Enable G Suite Domain-wide Delegation
# Google Admin > Security > API Controls > Domain-wide Delegation
# Agregar Client ID con scope: https://www.googleapis.com/auth/gmail.send
```

### Scopes Requeridos

```typescript
// Enviar emails (mínimo recomendado)
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

// Gestionar borradores y enviar
const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";

// Solo lectura
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// Acceso completo (evitar si es posible)
const GMAIL_FULL_SCOPE = "https://mail.google.com/";
```

## Configuración del Cliente TypeScript

### Con Service Account (Recomendado Producción)

```typescript
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

function createGmailClient(
  serviceAccountJson: string,
  subjectEmail: string,
): Result<gmail_v1.Gmail> {
  try {
    const key = JSON.parse(serviceAccountJson) as ServiceAccountKey;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: key.client_email,
        private_key: key.private_key,
      },
      scopes: [GMAIL_SEND_SCOPE],
      subject: subjectEmail,
    });

    const gmail = google.gmail({ version: "v1", auth });
    return [null, gmail];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Uso en script Windmill

```typescript
import type { gmail_v1 } from "googleapis";

type Result<T> = [Error | null, T | null];

export async function main(
  gmailCredentials: string,
  toEmail: string,
  subject: string,
  body: string,
): Promise<Result<Readonly<Record<string, unknown>>>> {
  const [clientErr, gmail] = createGmailClient(gmailCredentials, "noreply@yourdomain.com");
  if (clientErr != null) {
    return [clientErr, null];
  }

  const message = createMIMEMessage("noreply@yourdomain.com", toEmail, subject, body);

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: message },
    });

    const result = response.data;

    return [null, {
      message_id: result.id,
      thread_id: result.threadId,
      status: "sent",
    }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

## Creación de Mensajes MIME

### Email Simple (Texto Plano + HTML)

```typescript
function createMIMEMessage(
  from: string,
  to: string,
  subject: string,
  htmlBody: string,
): string {
  const boundary = "boundary123456";
  const textBody = htmlBody.replace(/<[^>]*>/g, "");

  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
  ].join("\r\n");

  const textPart = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    textBody,
    "",
  ].join("\r\n");

  const htmlPart = [
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    htmlBody,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const mimeMessage = `${headers}\r\n${textPart}\r\n${htmlPart}`;

  // Codificar en base64 URL-safe
  return Buffer.from(mimeMessage)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
```

### Email con Adjuntos

```typescript
interface Attachment {
  filename: string;
  contentType: string;
  data: Buffer;
}

function createMIMEMessageWithAttachment(
  from: string,
  to: string,
  subject: string,
  body: string,
  attachments: readonly Attachment[],
): string {
  const mixedBoundary = "mixed-boundary-123456";
  const altBoundary = "alt-boundary-789012";
  const textBody = body.replace(/<[^>]*>/g, "");

  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
  ].join("\r\n");

  let mimeMessage = headers;

  // Parte del cuerpo (alternative: plain + html)
  mimeMessage += `--${mixedBoundary}\r\n`;
  mimeMessage += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

  // Plain text
  mimeMessage += `--${altBoundary}\r\n`;
  mimeMessage += `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
  mimeMessage += `${textBody}\r\n`;

  // HTML
  mimeMessage += `--${altBoundary}\r\n`;
  mimeMessage += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
  mimeMessage += `${body}\r\n`;
  mimeMessage += `--${altBoundary}--\r\n`;

  // Adjuntos
  for (const att of attachments) {
    mimeMessage += `--${mixedBoundary}\r\n`;
    mimeMessage += `Content-Type: ${att.contentType}\r\n`;
    mimeMessage += `Content-Transfer-Encoding: base64\r\n`;
    mimeMessage += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`;

    const encoded = att.data.toString("base64");
    // Insertar saltos de línea cada 76 caracteres (RFC 2045)
    for (let i = 0; i < encoded.length; i += 76) {
      mimeMessage += `${encoded.slice(i, i + 76)}\r\n`;
    }
  }

  mimeMessage += `--${mixedBoundary}--\r\n`;

  return Buffer.from(mimeMessage)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
```

### Plantillas HTML

```typescript
function renderBookingEmail(data: Readonly<{
  userName: string;
  bookingId: string;
  providerName: string;
  serviceName: string;
  startTime: string;
}>): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Reserva Confirmada</h1>
        </div>
        <div class="content">
            <p>Hola ${escapeHtml(data.userName)},</p>
            <p>Tu reserva ha sido confirmada exitosamente.</p>

            <div class="details">
                <h3>Detalles de la Reserva:</h3>
                <p><strong>ID:</strong> ${escapeHtml(data.bookingId)}</p>
                <p><strong>Proveedor:</strong> ${escapeHtml(data.providerName)}</p>
                <p><strong>Servicio:</strong> ${escapeHtml(data.serviceName)}</p>
                <p><strong>Fecha:</strong> ${escapeHtml(data.startTime)}</p>
            </div>

            <p>Si necesitas cancelar o reprogramar, por favor responde a este email.</p>
        </div>
        <div class="footer">
            <p>© 2026 Booking Titanium. Todos los derechos reservados.</p>
        </div>
    </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendBookingConfirmationEmail(
  gmail: gmail_v1.Gmail,
  to: string,
  data: Readonly<{
    userName: string;
    bookingId: string;
    providerName: string;
    serviceName: string;
    startTime: string;
  }>,
): Promise<Result<null>> {
  const htmlBody = renderBookingEmail(data);

  const message = createMIMEMessage(
    "noreply@booking-titanium.com",
    to,
    `Reserva Confirmada - ${data.bookingId}`,
    htmlBody,
  );

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: message },
    });
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

## Rate Limiting y Reintentos

### Límites de Gmail API

| Tipo | Límite | Notas |
|------|--------|-------|
| **Envíos por día** | 500 (Gmail free) | Por usuario |
| **Envíos por día** | 2,000 (Workspace) | Por usuario |
| **Quota por segundo** | 250 unidades | Por usuario |
| **Costo por send** | 100 unidades | ~2-3 emails/segundo |

### Manejo de Error 429

```typescript
function parseRetryAfter(header: string | null): number {
  if (header == null) return 0;

  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds;

  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    return Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
  }

  return 0;
}

async function sendEmailWithRetry(
  gmail: gmail_v1.Gmail,
  message: string,
  maxRetries: number,
): Promise<Result<gmail_v1.Schema$Message>> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: message },
      });
      return [null, response.data];
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));

      if (err instanceof Error && "code" in err) {
        const code = (err as { code: number }).code;

        if (code === 429) {
          const retryAfter = parseRetryAfter(
            (err as { response?: { headers: Record<string, string> } }).response?.headers?.["retry-after"] ?? null,
          );

          const waitMs = retryAfter > 0
            ? retryAfter * 1000
            : Math.min(2 ** attempt * 1000, 60_000);

          console.log(`Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        if (code >= 500) {
          const backoff = Math.min(2 ** attempt * 1000, 60_000);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }
      }

      return [lastErr, null];
    }
  }

  return [lastErr ?? new Error("Max retries exceeded"), null];
}
```

### Cola de Emails (Queue)

```typescript
interface QueuedEmail {
  to: string;
  subject: string;
  body: string;
  retry: number;
}

class EmailQueue {
  private queue: QueuedEmail[] = [];
  private processing = false;

  constructor(
    private gmail: gmail_v1.Gmail,
    private workers: number,
  ) {}

  async send(to: string, subject: string, body: string): Promise<void> {
    this.queue.push({ to, subject, body, retry: 0 });

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

      const message = createMIMEMessage(
        "noreply@booking-titanium.com",
        msg.to,
        msg.subject,
        msg.body,
      );

      const [err] = await sendEmailWithRetry(this.gmail, message, 3);

      if (err != null && msg.retry < 3) {
        msg.retry++;
        this.queue.push(msg);
        await new Promise((resolve) => setTimeout(resolve, msg.retry * 1000));
      }
    }
  }
}
```

## Monitoreo de Bounces

### Detección de Bounces

```typescript
// Gmail no tiene webhook nativo para bounces
// Estrategias alternativas:

// 1. Monitorear emails de bounce en bandeja de entrada
async function checkBounceEmails(gmail: gmail_v1.Gmail): Promise<Result<string[]>> {
  try {
    const query = 'from:mailer-daemon OR from:postmaster OR subject:"Delivery Status Notification"';

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
    });

    const messages = listResponse.data.messages ?? [];
    const bouncedEmails: string[] = [];

    for (const msg of messages) {
      if (msg.id == null) continue;

      const email = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
      });

      const bouncedEmail = extractBouncedEmail(email.data);
      if (bouncedEmail != null) {
        bouncedEmails.push(bouncedEmail);
        await markEmailAsBounced(bouncedEmail);
      }
    }

    return [null, bouncedEmails];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), []];
  }
}

function extractBouncedEmail(email: gmail_v1.Schema$Message): string | null {
  const snippet = email.snippet ?? "";
  const match = snippet.match(/[\w.-]+@[\w.-]+\.\w+/);
  return match?.[0] ?? null;
}

async function markEmailAsBounced(email: string): Promise<Result<null>> {
  const pool = await getPool();
  try {
    await pool.query(
      `INSERT INTO email_bounces (email, bounce_type, created_at)
       VALUES ($1, 'hard', NOW())
       ON CONFLICT (email) DO NOTHING`,
      [email],
    );
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Tabla de Bounces en DB

```sql
CREATE TABLE email_bounces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    bounce_type VARCHAR(50),
    reason TEXT,
    booking_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notified_at TIMESTAMPTZ
);

CREATE INDEX idx_bounces_email ON email_bounces(email);
CREATE INDEX idx_bounces_notified ON email_bounces(notified_at) WHERE notified_at IS NULL;

-- Función para verificar antes de enviar
CREATE OR REPLACE FUNCTION should_send_email(to_email VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM email_bounces
        WHERE email = to_email
        AND bounce_type = 'hard'
        AND created_at > NOW() - INTERVAL '30 days'
    ) THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

## Errores Comunes

### ❌ No Manejar Rate Limits

```typescript
// MAL: Enviar sin control
await gmail.users.messages.send({ userId: "me", requestBody: { raw: message } });
// Puede ser 429!

// BIEN: Con retry
const [err, result] = await sendEmailWithRetry(gmail, message, 3);
```

### ❌ No Codificar Base64 Correctamente

```typescript
// MAL: Base64 estándar
const raw = Buffer.from(mimeMsg).toString("base64");

// BIEN: Base64 URL-safe para Gmail API
const raw = Buffer.from(mimeMsg)
  .toString("base64")
  .replaceAll("+", "-")
  .replaceAll("/", "_")
  .replaceAll("=", "");
```

### ❌ MIME Message Mal Formateado

```typescript
// MAL: Sin boundaries correctos
const headers = `Content-Type: multipart/alternative\r\n`;
// Falta boundary!

// BIEN: Con boundary
const boundary = "unique-boundary-123456";
const headers = `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
```

### ❌ No Verificar Bounces

```typescript
// MAL: Enviar a emails que rebotaron
await sendEmail(to, subject, body);

// BIEN: Verificar primero
const [_, shouldSend] = await shouldSendEmail(to);
if (shouldSend) {
  await sendEmail(to, subject, body);
} else {
  console.log(`Skipping email to bounced address: ${to}`);
}
```

## Checklist Producción

- [ ] Service Account con domain-wide delegation
- [ ] Scope mínimo: gmail.send
- [ ] Cliente Gmail con OAuth2 token refresh
- [ ] Plantillas HTML con escapeHtml
- [ ] MIME message con boundaries correctos
- [ ] Base64 URL-safe encoding
- [ ] Rate limiter con retry (429 handling)
- [ ] Cola de emails para broadcasts
- [ ] Monitoreo de bounces
- [ ] Tabla de bounces en DB
- [ ] Logging estructurado de envíos
- [ ] Métricas de entrega (success rate, bounce rate)
