# Google Calendar API con TypeScript y Service Account - Best Practices

## Autenticación con Service Account

### Setup en Google Cloud Console

```bash
# 1. Crear Service Account
# IAM & Admin > Service Accounts > Create Service Account
# Nombre: booking-titanium-calendar

# 2. Habilitar Google Calendar API
# APIs & Services > Library > Google Calendar API > Enable

# 3. Crear clave JSON
# Service Account > Keys > Add Key > Create New Key > JSON
# Guardar como: gcal-credentials.json

# 4. Domain-wide Delegation (si accedes a calendars de usuarios)
# Service Account > Enable G Suite Domain-wide Delegation
# Google Admin > Security > API Controls > Domain-wide Delegation
# Agregar Client ID con scope: https://www.googleapis.com/auth/calendar.events
```

### Scopes Requeridos

```typescript
// Solo lectura de eventos
const CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

// Crear/eliminar eventos
const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// Gestionar calendarios
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
```

## Configuración del Cliente TypeScript

### Crear Servicio Calendar con googleapis

```typescript
import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";

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

function createCalendarClient(
  serviceAccountJson: string,
  subjectEmail?: string,
): Result<calendar_v3.Calendar> {
  try {
    const key = JSON.parse(serviceAccountJson) as ServiceAccountKey;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: key.client_email,
        private_key: key.private_key,
      },
      scopes: [CALENDAR_EVENTS_SCOPE],
      ...(subjectEmail != null && { subject: subjectEmail }),
    });

    const calendar = google.calendar({ version: "v3", auth });
    return [null, calendar];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Uso en script Windmill

```typescript
import type { calendar_v3 } from "googleapis";

type Result<T> = [Error | null, T | null];

export async function main(
  gcalCredentials: string,
  calendarId: string,
  summary: string,
  description: string,
  startTime: string,
  endTime: string,
  attendeeEmails: readonly string[],
): Promise<Result<Readonly<Record<string, unknown>>>> {
  const [clientErr, service] = createCalendarClient(gcalCredentials);
  if (clientErr != null) {
    return [clientErr, null];
  }

  const event: calendar_v3.Schema$Event = {
    summary,
    description,
    start: {
      dateTime: startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: endTime,
      timeZone: "UTC",
    },
    status: "confirmed",
    attendees: attendeeEmails.map((email) => ({ email })),
  };

  try {
    const response = await service.events.insert({
      calendarId,
      requestBody: event,
    });

    const createdEvent = response.data;

    return [null, {
      event_id: createdEvent.id,
      html_link: createdEvent.htmlLink,
      status: createdEvent.status,
      created_at: createdEvent.created,
    }];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

## Creación de Eventos

### Evento Simple

```typescript
async function createCalendarEvent(
  service: calendar_v3.Calendar,
  calendarId: string,
  summary: string,
  description: string,
  location: string,
  startTime: string,
  endTime: string,
): Promise<Result<calendar_v3.Schema$Event>> {
  const event: calendar_v3.Schema$Event = {
    summary,
    description,
    location,
    start: {
      dateTime: startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: endTime,
      timeZone: "UTC",
    },
    status: "confirmed",
  };

  try {
    const response = await service.events.insert({
      calendarId,
      requestBody: event,
    });
    return [null, response.data];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Evento con Google Meet

```typescript
async function createEventWithGoogleMeet(
  service: calendar_v3.Calendar,
  calendarId: string,
  summary: string,
  startTime: string,
  endTime: string,
): Promise<Result<calendar_v3.Schema$Event>> {
  const event: calendar_v3.Schema$Event = {
    summary,
    start: {
      dateTime: startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: endTime,
      timeZone: "UTC",
    },
    conferenceData: {
      createRequest: {
        requestId: `booking-${Date.now()}`,
        conferenceSolutionKey: {
          type: "hangoutsMeet",
        },
      },
    },
  };

  try {
    const response = await service.events.insert({
      calendarId,
      requestBody: event,
      conferenceDataVersion: 1,
    });
    return [null, response.data];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Evento con Attendees y Reminders

```typescript
async function createEventWithAttendees(
  service: calendar_v3.Calendar,
  calendarId: string,
  summary: string,
  startTime: string,
  endTime: string,
  organizerEmail: string,
  attendeeEmails: readonly string[],
): Promise<Result<calendar_v3.Schema$Event>> {
  const event: calendar_v3.Schema$Event = {
    summary,
    start: {
      dateTime: startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: endTime,
      timeZone: "UTC",
    },
    organizer: {
      email: organizerEmail,
      self: true,
      displayName: "Booking Titanium",
    },
    attendees: attendeeEmails.map((email) => ({
      email,
      optional: false,
      responseStatus: "needsAction",
    })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 1440 },
        { method: "popup", minutes: 30 },
      ],
    },
  };

  try {
    const response = await service.events.insert({
      calendarId,
      requestBody: event,
    });
    return [null, response.data];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

## Manejo de Timezones

### Mejor Práctica: UTC Internamente

```typescript
// ✅ BIEN: Usar UTC internamente
function createBookingEvent(startTime: string, durationMinutes: number): calendar_v3.Schema$Event {
  const end = new Date(new Date(startTime).getTime() + durationMinutes * 60 * 1000).toISOString();

  return {
    start: {
      dateTime: startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: end,
      timeZone: "UTC",
    },
  };
}

// ❌ MAL: Usar timezone local sin especificar
function createBookingEventBad(startTime: string): calendar_v3.Schema$Event {
  return {
    start: {
      dateTime: startTime,
      // TimeZone faltante!
    },
  };
}
```

### Convertir a Timezone del Usuario

```typescript
function displayInUserLocation(eventTime: Date, userTimezone: string): string {
  try {
    return eventTime.toLocaleString("es-MX", {
      timeZone: userTimezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return eventTime.toISOString();
  }
}

// Uso
const utcTime = new Date();
const userTime = displayInUserLocation(utcTime, "America/New_York");
// Output: "27/03/2026, 10:00 a. m. EDT"
```

### IANA Time Zones Comunes

```typescript
const commonTimezones: ReadonlyMap<string, string> = new Map([
  ["US Eastern", "America/New_York"],
  ["US Central", "America/Chicago"],
  ["US Pacific", "America/Los_Angeles"],
  ["Europe London", "Europe/London"],
  ["Europe Madrid", "Europe/Madrid"],
  ["America Mexico City", "America/Mexico_City"],
  ["Asia Tokyo", "Asia/Tokyo"],
  ["UTC", "UTC"],
]);
```

## Eliminación de Eventos (Rollback)

### Delete Event

```typescript
async function deleteCalendarEvent(
  service: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<Result<null>> {
  try {
    await service.events.delete({ calendarId, eventId });
    return [null, null];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Rollback en Caso de Error

```typescript
async function createBookingWithRollback(
  service: calendar_v3.Calendar,
  calendarId: string,
  bookingData: Readonly<{
    userName: string;
    serviceName: string;
    startTime: string;
    endTime: string;
  }>,
): Promise<Result<{ bookingId: string; eventId: string; htmlLink: string | null | undefined }>> {
  const event: calendar_v3.Schema$Event = {
    summary: `Booking - ${bookingData.userName}`,
    description: bookingData.serviceName,
    start: {
      dateTime: bookingData.startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: bookingData.endTime,
      timeZone: "UTC",
    },
  };

  const [createErr, createdEvent] = await createCalendarEventFromObject(service, calendarId, event);
  if (createErr != null) {
    return [createErr, null];
  }

  if (createdEvent == null || createdEvent.id == null) {
    return [new Error("Event created but ID is missing"), null];
  }

  // Registrar rollback para GCal
  const rollback = async (): Promise<void> => {
    await deleteCalendarEvent(service, calendarId, createdEvent.id!);
  };

  try {
    const [dbErr, booking] = await createBookingInDB(bookingData, createdEvent.id);
    if (dbErr != null) {
      await rollback();
      return [dbErr, null];
    }

    return [null, {
      bookingId: booking.id,
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink,
    }];
  } catch (err) {
    await rollback();
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function createCalendarEventFromObject(
  service: calendar_v3.Calendar,
  calendarId: string,
  event: calendar_v3.Schema$Event,
): Promise<Result<calendar_v3.Schema$Event>> {
  try {
    const response = await service.events.insert({
      calendarId,
      requestBody: event,
    });
    return [null, response.data];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

### Verificar Existencia Antes de Eliminar

```typescript
async function safeDeleteEvent(
  service: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<Result<null>> {
  try {
    await service.events.get({ calendarId, eventId });
  } catch (err) {
    if (isNotFound(err)) {
      return [null, null];
    }
    return [err instanceof Error ? err : new Error(String(err)), null];
  }

  return deleteCalendarEvent(service, calendarId, eventId);
}

function isNotFound(err: unknown): boolean {
  if (err instanceof Error && "code" in err) {
    return (err as { code: number }).code === 404;
  }
  return false;
}
```

## Concurrencia y Prevención de Double-Booking

### Verificar Disponibilidad Antes de Crear

```typescript
async function checkAvailability(
  service: calendar_v3.Calendar,
  calendarId: string,
  startTime: string,
  endTime: string,
): Promise<Result<boolean>> {
  try {
    const response = await service.events.list({
      calendarId,
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items ?? [];
    return [null, events.length === 0];
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}

async function createEventWithConflictCheck(
  service: calendar_v3.Calendar,
  calendarId: string,
  event: calendar_v3.Schema$Event,
  maxRetries: number,
): Promise<Result<calendar_v3.Schema$Event>> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (event.start?.dateTime == null || event.end?.dateTime == null) {
      return [new Error("Event start/end dateTime is missing"), null];
    }

    const [availErr, available] = await checkAvailability(
      service,
      calendarId,
      event.start.dateTime,
      event.end.dateTime,
    );
    if (availErr != null) return [availErr, null];

    if (!available) {
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        continue;
      }
      return [new Error("Time slot not available"), null];
    }

    try {
      const response = await service.events.insert({
        calendarId,
        requestBody: event,
      });
      return [null, response.data];
    } catch (err) {
      if (isConflictError(err)) {
        if (attempt < maxRetries - 1) {
          continue;
        }
      }
      return [err instanceof Error ? err : new Error(String(err)), null];
    }
  }

  return [new Error("Max retries exceeded"), null];
}

function isConflictError(err: unknown): boolean {
  if (err instanceof Error && "code" in err) {
    return (err as { code: number }).code === 409;
  }
  return false;
}
```

### Optimistic Concurrency con ETag

```typescript
async function updateEventWithEtag(
  service: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  updateFn: (event: calendar_v3.Schema$Event) => Result<null>,
): Promise<Result<null>> {
  try {
    const getResponse = await service.events.get({ calendarId, eventId });
    const event = getResponse.data;
    const originalEtag = event.etag;

    if (originalEtag == null) {
      return [new Error("Event ETag is missing"), null];
    }

    const [updateErr] = updateFn(event);
    if (updateErr != null) return [updateErr, null];

    await service.events.update({
      calendarId,
      eventId,
      requestBody: event,
    });

    return [null, null];
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      const code = (err as { code: number }).code;
      if (code === 412) {
        return [new Error("Event modified by another process"), null];
      }
    }
    return [err instanceof Error ? err : new Error(String(err)), null];
  }
}
```

## Rate Limiting

### Límites de Calendar API

| Tipo | Límite | Notas |
|------|--------|-------|
| **Queries por día** | 1,000,000 | Por proyecto |
| **Queries por segundo** | 10-100 | Por usuario, varía por quota |
| **Costo por insert** | 10 units | |
| **Costo por delete** | 1 unit | |
| **Costo por get** | 1 unit | |

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

async function createEventWithRateLimit(
  service: calendar_v3.Calendar,
  calendarId: string,
  event: calendar_v3.Schema$Event,
): Promise<Result<calendar_v3.Schema$Event>> {
  const maxRetries = 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await service.events.insert({
        calendarId,
        requestBody: event,
      });
      return [null, response.data];
    } catch (err) {
      if (err instanceof Error && "code" in err) {
        const code = (err as { code: number }).code;

        if (code === 429) {
          const retryAfter = parseRetryAfter(
            (err as { response?: { headers: Record<string, string> } }).response?.headers?.["retry-after"] ?? null,
          );

          const waitMs = retryAfter > 0
            ? retryAfter * 1000
            : Math.min(2 ** attempt * 1000, 60_000);

          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
      }

      return [err instanceof Error ? err : new Error(String(err)), null];
    }
  }

  return [new Error("Max retries exceeded for GCal insert"), null];
}
```

## Errores Comunes

### ❌ No Usar UTC

```typescript
// MAL: Timezone local puede causar confusión
const event = {
  start: { dateTime: "2026-03-27T10:00:00" },
};

// BIEN: UTC explícito
const event = {
  start: { dateTime: "2026-03-27T10:00:00Z", timeZone: "UTC" },
};
```

### ❌ No Guardar Event ID

```typescript
// MAL: No poder hacer rollback
await service.events.insert({ calendarId, requestBody: event });
// ¿Cómo elimino este evento si falla el booking?

// BIEN: Guardar ID para rollback
const response = await service.events.insert({ calendarId, requestBody: event });
const eventId = response.data.id; // Guardar para rollback
```

### ❌ No Verificar Disponibilidad

```typescript
// MAL: Asumir que está disponible
await service.events.insert({ calendarId, requestBody: event });

// BIEN: Verificar primero
const [_, available] = await checkAvailability(service, calendarId, start, end);
if (!available) {
  return [new Error("Time slot not available"), null];
}
await service.events.insert({ calendarId, requestBody: event });
```

### ❌ No Manejar Conflictos

```typescript
// MAL: Sin retry para conflictos
const response = await service.events.insert({ calendarId, requestBody: event });
// Puede ser 409 Conflict!

// BIEN: Retry para conflictos
const [err, result] = await createEventWithConflictCheck(service, calendarId, event, 3);
```

## Checklist Producción

- [ ] Service Account con domain-wide delegation
- [ ] Scope: calendar.events
- [ ] Cliente Calendar con OAuth2
- [ ] Todos los timestamps en UTC
- [ ] Guardar Event ID en DB para rollback
- [ ] Verificar disponibilidad antes de crear
- [ ] Manejo de error 429 con exponential backoff
- [ ] Manejo de error 409 (conflictos)
- [ ] Rollback: delete event si falla booking
- [ ] Rate limiting (10-100 queries/segundo)
- [ ] Logging estructurado de eventos creados/eliminados
- [ ] Monitoreo de quota usage
