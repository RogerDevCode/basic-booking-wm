# Google Calendar API con Go y Service Account - Best Practices

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

```go
import "google.golang.org/api/calendar/v3"

const (
    // Solo lectura de eventos
    CalendarReadonlyScope = "https://www.googleapis.com/auth/calendar.readonly"
    
    // Crear/eliminar eventos
    CalendarEventsScope = "https://www.googleapis.com/auth/calendar.events"
    
    // Gestionar calendarios
    CalendarScope = "https://www.googleapis.com/auth/calendar"
    
    // Acceso completo
    CalendarFullScope = "https://www.googleapis.com/auth/calendar"
)
```

## Configuración del Cliente Go

### Crear Servicio Calendar

```go
package inner

import (
    "context"
    "encoding/json"
    "fmt"
    
    "golang.org/x/oauth2"
    "golang.org/x/oauth2/google"
    "google.golang.org/api/calendar/v3"
    "google.golang.org/api/option"
)

// ServiceAccountKey representa la clave JSON
type ServiceAccountKey struct {
    Type         string `json:"type"`
    ProjectID    string `json:"project_id"`
    PrivateKeyID string `json:"private_key_id"`
    PrivateKey   string `json:"private_key"`
    ClientEmail  string `json:"client_email"`
    ClientID     string `json:"client_id"`
    AuthURI      string `json:"auth_uri"`
    TokenURI     string `json:"token_uri"`
}

// Crear cliente Calendar con Service Account
func createCalendarClient(ctx context.Context, serviceAccountJSON string) (*calendar.Service, error) {
    // Parsear JSON
    var key ServiceAccountKey
    if err := json.Unmarshal([]byte(serviceAccountJSON), &key); err != nil {
        return nil, fmt.Errorf("failed to parse service account key: %w", err)
    }
    
    // Configurar JWT para service account
    conf := &jwt.Config{
        Email:      key.ClientEmail,
        PrivateKey: []byte(key.PrivateKey),
        Scopes:     []string{calendar.CalendarEventsScope},
        TokenURL:   key.TokenURI,
    }
    
    // Obtener token source
    tokenSource := conf.TokenSource(ctx)
    
    // Crear cliente HTTP
    client := oauth2.NewClient(ctx, tokenSource)
    
    // Inicializar servicio Calendar
    calService, err := calendar.NewService(ctx, option.WithHTTPClient(client))
    if err != nil {
        return nil, fmt.Errorf("failed to create Calendar service: %w", err)
    }
    
    return calService, nil
}

// Uso en script Windmill
func main(
    ctx context.Context,
    gcalCredentials string, // RT.Gcal o variable
    calendarID string,      // ID del calendario (o "primary")
    summary string,
    description string,
    startTime string,       // RFC3339
    endTime string,         // RFC3339
    attendeeEmails []string,
) (map[string]any, error) {
    // Crear cliente
    service, err := createCalendarClient(ctx, gcalCredentials)
    if err != nil {
        return nil, err
    }
    
    // Crear evento
    event := &calendar.Event{
        Summary:     summary,
        Description: description,
        Start: &calendar.EventDateTime{
            DateTime: startTime,
            TimeZone: "UTC", // Siempre usar UTC
        },
        End: &calendar.EventDateTime{
            DateTime: endTime,
            TimeZone: "UTC",
        },
        Status: "confirmed",
    }
    
    // Agregar attendees
    for _, email := range attendeeEmails {
        event.Attendees = append(event.Attendees, &calendar.EventAttendee{
            Email: email,
        })
    }
    
    // Insertar evento
    createdEvent, err := service.Events.Insert(calendarID, event).Do()
    if err != nil {
        return nil, fmt.Errorf("failed to create event: %w", err)
    }
    
    return map[string]any{
        "event_id":    createdEvent.Id,
        "html_link":   createdEvent.HtmlLink,
        "status":      createdEvent.Status,
        "created_at":  createdEvent.Created,
    }, nil
}
```

## Creación de Eventos

### Evento Simple

```go
func createCalendarEvent(
    service *calendar.Service,
    calendarID string,
    summary, description, location string,
    startTime, endTime time.Time,
) (*calendar.Event, error) {
    event := &calendar.Event{
        Summary:     summary,
        Description: description,
        Location:    location,
        Start: &calendar.EventDateTime{
            DateTime: startTime.Format(time.RFC3339),
            TimeZone: "UTC", // Siempre UTC en backend
        },
        End: &calendar.EventDateTime{
            DateTime: endTime.Format(time.RFC3339),
            TimeZone: "UTC",
        },
        Status:  "confirmed",
        Created: time.Now().UTC().Format(time.RFC3339),
    }
    
    return service.Events.Insert(calendarID, event).Do()
}
```

### Evento con Google Meet

```go
func createEventWithGoogleMeet(
    service *calendar.Service,
    calendarID string,
    summary string,
    startTime, endTime time.Time,
) (*calendar.Event, error) {
    event := &calendar.Event{
        Summary: summary,
        Start: &calendar.EventDateTime{
            DateTime: startTime.Format(time.RFC3339),
            TimeZone: "UTC",
        },
        End: &calendar.EventDateTime{
            DateTime: endTime.Format(time.RFC3339),
            TimeZone: "UTC",
        },
        // Habilitar Google Meet
        ConferenceData: &calendar.ConferenceData{
            CreateRequest: &calendar.CreateConferenceRequest{
                RequestID: fmt.Sprintf("booking-%d", time.Now().UnixNano()),
                ConferenceSolutionKey: &calendar.ConferenceSolutionKey{
                    Type: "hangoutsMeet",
                },
            },
        },
    }
    
    return service.Events.Insert(calendarID, event).ConferenceDataVersion(1).Do()
}
```

### Evento con Attendees y Reminders

```go
func createEventWithAttendees(
    service *calendar.Service,
    calendarID string,
    summary string,
    startTime, endTime time.Time,
    organizerEmail string,
    attendeeEmails []string,
) (*calendar.Event, error) {
    event := &calendar.Event{
        Summary: summary,
        Start: &calendar.EventDateTime{
            DateTime: startTime.Format(time.RFC3339),
            TimeZone: "UTC",
        },
        End: &calendar.EventDateTime{
            DateTime: endTime.Format(time.RFC3339),
            TimeZone: "UTC",
        },
        Organizer: &calendar.EventOrganizer{
            Email:         organizerEmail,
            Self:          true,
            DisplayName:   "Booking Titanium",
        },
        Attendees: []*calendar.EventAttendee{},
        Reminders: &calendar.EventReminders{
            UseDefault: false,
            Overrides: []*calendar.EventReminder{
                {
                    Method:  "email",
                    Minutes: 1440, // 24 horas antes
                },
                {
                    Method:  "popup",
                    Minutes: 30, // 30 minutos antes
                },
            },
        },
    }
    
    // Agregar attendees
    for _, email := range attendeeEmails {
        event.Attendees = append(event.Attendees, &calendar.EventAttendee{
            Email:     email,
            Optional:  false,
            ResponseStatus: "needsAction",
        })
    }
    
    return service.Events.Insert(calendarID, event).Do()
}
```

## Manejo de Timezones

### Mejor Práctica: UTC Internamente

```go
// ✅ BIEN: Usar UTC internamente
func createBookingEvent(startTime time.Time) *calendar.Event {
    return &calendar.Event{
        Start: &calendar.EventDateTime{
            DateTime: startTime.UTC().Format(time.RFC3339),
            TimeZone: "UTC",
        },
        End: &calendar.EventDateTime{
            DateTime: startTime.Add(30 * time.Minute).UTC().Format(time.RFC3339),
            TimeZone: "UTC",
        },
    }
}

// ❌ MAL: Usar timezone local sin especificar
func createBookingEventBad(startTime time.Time) *calendar.Event {
    return &calendar.Event{
        Start: &calendar.EventDateTime{
            DateTime: startTime.Format(time.RFC3339), // Puede tener offset local
            // TimeZone faltante!
        },
    }
}
```

### Convertir a Timezone del Usuario

```go
func displayInUserLocation(eventTime time.Time, userTimezone string) string {
    // Parsear timezone del usuario
    loc, err := time.LoadLocation(userTimezone)
    if err != nil {
        loc = time.UTC // Fallback
    }
    
    // Convertir UTC a timezone local
    return eventTime.In(loc).Format("02/01/2006 15:04 MST")
}

// Uso
utcTime := time.Now().UTC()
userTime := displayInUserLocation(utcTime, "America/New_York")
// Output: "27/03/2026 10:00 EDT"
```

### IANA Time Zones Comunes

```go
var commonTimezones = map[string]string{
    "US Eastern":    "America/New_York",
    "US Central":    "America/Chicago",
    "US Pacific":    "America/Los_Angeles",
    "Europe London": "Europe/London",
    "Europe Madrid": "Europe/Madrid",
    "Asia Tokyo":    "Asia/Tokyo",
    "UTC":           "UTC",
}
```

## Eliminación de Eventos (Rollback)

### Delete Event

```go
func deleteCalendarEvent(
    service *calendar.Service,
    calendarID string,
    eventID string,
) error {
    err := service.Events.Delete(calendarID, eventID).Do()
    if err != nil {
        return fmt.Errorf("failed to delete event: %w", err)
    }
    return nil
}
```

### Rollback en Caso de Error

```go
func createBookingWithRollback(
    ctx context.Context,
    service *calendar.Service,
    calendarID string,
    bookingData BookingData,
) (*BookingResult, error) {
    var createdEvent *calendar.Event
    var rollbackFuncs []func() error
    
    // 1. Crear evento GCal
    event := &calendar.Event{
        Summary:     "Booking - " + bookingData.UserName,
        Description: bookingData.ServiceName,
        Start: &calendar.EventDateTime{
            DateTime: bookingData.StartTime.UTC().Format(time.RFC3339),
            TimeZone: "UTC",
        },
        End: &calendar.EventDateTime{
            DateTime: bookingData.EndTime.UTC().Format(time.RFC3339),
            TimeZone: "UTC",
        },
    }
    
    createdEvent, err := service.Events.Insert(calendarID, event).Do()
    if err != nil {
        return nil, fmt.Errorf("failed to create GCal event: %w", err)
    }
    
    // Registrar rollback para GCal
    rollbackFuncs = append(rollbackFuncs, func() error {
        return deleteCalendarEvent(service, calendarID, createdEvent.Id)
    })
    
    // 2. Crear booking en DB
    booking, err := createBookingInDB(ctx, bookingData, createdEvent.Id)
    if err != nil {
        // Rollback: eliminar evento GCal
        for _, rollback := range rollbackFuncs {
            rollback() // Ignorar errores de rollback
        }
        return nil, fmt.Errorf("failed to create booking in DB: %w", err)
    }
    
    return &BookingResult{
        BookingID: booking.ID,
        EventID:   createdEvent.Id,
        HtmlLink:  createdEvent.HtmlLink,
    }, nil
}
```

### Verificar Existencia Antes de Eliminar

```go
func safeDeleteEvent(
    service *calendar.Service,
    calendarID string,
    eventID string,
) error {
    // Verificar si existe
    _, err := service.Events.Get(calendarID, eventID).Do()
    if err != nil {
        if isNotFound(err) {
            // Ya fue eliminado, no hacer nada
            return nil
        }
        return err
    }
    
    // Eliminar
    return service.Events.Delete(calendarID, eventID).Do()
}

func isNotFound(err error) bool {
    var gErr *googleapi.Error
    if errors.As(err, &gErr) {
        return gErr.Code == http.StatusNotFound
    }
    return false
}
```

## Concurrencia y Prevención de Double-Booking

### Verificar Disponibilidad Antes de Crear

```go
func checkAvailability(
    service *calendar.Service,
    calendarID string,
    startTime, endTime time.Time,
) (bool, error) {
    // Buscar eventos en el rango
    events, err := service.Events.List(calendarID).
        TimeMin(startTime.UTC().Format(time.RFC3339)).
        TimeMax(endTime.UTC().Format(time.RFC3339)).
        ShowDeleted(false).
        SingleEvents(true).
        OrderBy("startTime").
        Do()
    
    if err != nil {
        return false, err
    }
    
    // Si hay eventos, no está disponible
    return len(events.Items) == 0, nil
}

// Uso con retry
func createEventWithConflictCheck(
    service *calendar.Service,
    calendarID string,
    event *calendar.Event,
    maxRetries int,
) (*calendar.Event, error) {
    for attempt := 0; attempt < maxRetries; attempt++ {
        // Verificar disponibilidad
        start, _ := time.Parse(time.RFC3339, event.Start.DateTime)
        end, _ := time.Parse(time.RFC3339, event.End.DateTime)
        
        available, err := checkAvailability(service, calendarID, start, end)
        if err != nil {
            return nil, err
        }
        
        if !available {
            if attempt < maxRetries-1 {
                // Esperar y reintentar
                time.Sleep(time.Duration(attempt*100) * time.Millisecond)
                continue
            }
            return nil, ErrTimeSlotNotAvailable
        }
        
        // Intentar crear
        createdEvent, err := service.Events.Insert(calendarID, event).Do()
        if err != nil {
            // Verificar si es conflicto
            if isConflictError(err) {
                if attempt < maxRetries-1 {
                    continue
                }
            }
            return nil, err
        }
        
        return createdEvent, nil
    }
    
    return nil, ErrMaxRetriesExceeded
}

func isConflictError(err error) bool {
    var gErr *googleapi.Error
    if errors.As(err, &gErr) {
        return gErr.Code == http.StatusConflict // 409
    }
    return false
}
```

### Optimistic Concurrency con ETag

```go
func updateEventWithEtag(
    service *calendar.Service,
    calendarID string,
    eventID string,
    updateFunc func(*calendar.Event) error,
) error {
    // Obtener evento actual
    event, err := service.Events.Get(calendarID, eventID).Do()
    if err != nil {
        return err
    }
    
    // Guardar ETag original
    originalEtag := event.Etag
    
    // Aplicar actualización
    if err := updateFunc(event); err != nil {
        return err
    }
    
    // Intentar actualizar con ETag (conditional request)
    updatedEvent, err := service.Events.Update(calendarID, eventID, event).
        IfMatch(originalEtag). // Solo actualiza si ETag no cambió
        Do()
    
    if err != nil {
        var gErr *googleapi.Error
        if errors.As(err, &gErr) && gErr.Code == http.StatusPreconditionFailed {
            // ETag cambió, otro proceso modificó el evento
            return ErrEventModifiedByAnotherProcess
        }
        return err
    }
    
    _ = updatedEvent
    return nil
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

```go
func createEventWithRateLimit(
    ctx context.Context,
    service *calendar.Service,
    calendarID string,
    event *calendar.Event,
) (*calendar.Event, error) {
    maxRetries := 5
    
    for attempt := 0; attempt < maxRetries; attempt++ {
        createdEvent, err := service.Events.Insert(calendarID, event).Do()
        if err == nil {
            return createdEvent, nil
        }
        
        var gErr *googleapi.Error
        if !errors.As(err, &gErr) {
            return nil, err
        }
        
        if gErr.Code == 429 {
            // Rate limit exceeded
            retryAfter := parseRetryAfter(gErr.Header.Get("Retry-After"))
            if retryAfter == 0 {
                // Exponential backoff
                retryAfter = time.Duration(1<<uint(attempt)) * time.Second
                if retryAfter > 60*time.Second {
                    retryAfter = 60 * time.Second
                }
            }
            
            select {
            case <-time.After(retryAfter):
                continue
            case <-ctx.Done():
                return nil, ctx.Err()
            }
        }
        
        return nil, err
    }
    
    return nil, fmt.Errorf("max retries exceeded")
}
```

## Errores Comunes

### ❌ No Usar UTC

```go
// MAL: Timezone local puede causar confusión
event.Start = &calendar.EventDateTime{
    DateTime: "2026-03-27T10:00:00", // ¿Qué timezone?
}

// BIEN: UTC explícito
event.Start = &calendar.EventDateTime{
    DateTime: "2026-03-27T10:00:00Z",
    TimeZone: "UTC",
}
```

### ❌ No Guardar Event ID

```go
// MAL: No poder hacer rollback
service.Events.Insert(calendarID, event).Do()
// ¿Cómo elimino este evento si falla el booking?

// BIEN: Guardar ID para rollback
createdEvent, err := service.Events.Insert(calendarID, event).Do()
if err != nil {
    return err
}
booking.GCalEventID = createdEvent.Id // Guardar para rollback
```

### ❌ No Verificar Disponibilidad

```go
// MAL: Asumir que está disponible
service.Events.Insert(calendarID, event).Do()

// BIEN: Verificar primero
available, _ := checkAvailability(service, calendarID, start, end)
if !available {
    return ErrTimeSlotNotAvailable
}
service.Events.Insert(calendarID, event).Do()
```

### ❌ No Manejar Conflictos

```go
// MAL: Sin retry para conflictos
_, err := service.Events.Insert(calendarID, event).Do()
if err != nil {
    return err // Puede ser 409 Conflict!
}

// BIEN: Retry para conflictos
for i := 0; i < 3; i++ {
    _, err := service.Events.Insert(calendarID, event).Do()
    if err == nil {
        return nil
    }
    if isConflictError(err) {
        time.Sleep(100 * time.Millisecond)
        continue
    }
    return err
}
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
