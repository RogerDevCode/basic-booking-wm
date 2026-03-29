[33mNo defaultTs defined in your wmill.yaml. Using 'bun' as default.[39m
[34mUsing non-dotted paths (__flow, __app, __raw_app)[39m
[34m[90mComputing the files to update on the remote to match local (taking wmill.yaml includes/excludes into account)[39m[39m
[34m[39m
[33mStale scripts metadata found, you may want to update them using 'wmill script generate-metadata' before pushing:[39m
[33mf/availability-check/main (go)[39m
[33mf/booking-cancel/main (go)[39m
[33mf/booking-create/main (go)[39m
[33mf/booking-orchestrator/main (go)[39m
[33mf/booking-reschedule/main (go)[39m
[33mf/circuit-breaker-check/main (go)[39m
[33mf/circuit-breaker-record/main (go)[39m
[33mf/distributed-lock-acquire/main (go)[39m
[33mf/distributed-lock-release/main (go)[39m
[33mf/gcal-create-event/main (go)[39m
[33mf/gcal-delete-event/main (go)[39m
[33mf/get-providers-by-service/main (go)[39m
[33mf/get-providers/main (go)[39m
[33mf/get-services-by-provider/main (go)[39m
[33mf/get-services/main (go)[39m
[33mf/gmail-send/main (go)[39m
[33mf/internal/ai_agent/main (bun)[39m
[33mf/internal/message_parser/main (bun)[39m
[33mf/telegram-send/main (go)[39m
[34m[39m
[34m[90mRemote version: EE v1.665.0[39m[39m
[34mremote (booking-titanium) <- local: 42 changes to apply[39m
[33mWarning: Missing folder.meta.yaml for:
  - internal
  - booking-orchestrator-flow__flow
  - telegram-webhook__flow
Run 'wmill folder add-missing' to create them locally, then push again.[39m
[34m[32m+ folder f/availability-check/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/booking-cancel/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/booking-create/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/booking-orchestrator/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/booking-reschedule/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/circuit-breaker-check/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/circuit-breaker-record/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/distributed-lock-acquire/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/distributed-lock-release/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/gcal-create-event/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/gcal-delete-event/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/get-providers-by-service/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/get-providers/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/get-services-by-provider/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/get-services/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/gmail-send/folder.meta.yaml[90m[32m[39m[39m
[34m[32m+ folder f/telegram-send/folder.meta.yaml[90m[32m[39m[39m
[34m[33m~ script f/availability-check/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/availability-check/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    date:
      type: string
      description: ''
      default: null
      originalType: string
    providerID:
      type: integer
      description: ''
      default: null
    serviceID:
      type: integer
      description: ''
      default: null
  required:
    - providerID
    - serviceID
    - date
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Check Availability - Verifica disponibilidad para una fecha
description: Gets available time slots for a provider and service on a specific date
args:
  - type: integer
    name: providerID
    required: true
  - type: integer
    name: serviceID
    required: true
  - type: string
    name: date
    required: true
entrypoint: main
language: go
path: f/availability-check/main.go
[0m[39m
[34m[33m~ script f/booking-cancel/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/booking-cancel/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    bookingID:
      type: string
      description: ''
      default: null
      originalType: string
    cancellationReason:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - bookingID
    - cancellationReason
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Cancel Booking - Cancels an existing booking
description: Cancels a booking by ID with validation and status checks
args:
  - type: string
    name: bookingID
    required: true
  - type: string
    name: cancellationReason
    required: false
entrypoint: main
language: go
path: f/booking-cancel/main.go
[0m[39m
[34m[33m~ script f/booking-create/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/booking-create/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    chatID:
      type: string
      description: ''
      default: null
      originalType: string
    gcalEventID:
      type: string
      description: ''
      default: null
      originalType: string
    providerID:
      type: integer
      description: ''
      default: null
    serviceID:
      type: integer
      description: ''
      default: null
    startTime:
      type: string
      description: ''
      default: null
      originalType: string
    userEmail:
      type: string
      description: ''
      default: null
      originalType: string
    userName:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - providerID
    - serviceID
    - startTime
    - chatID
    - userName
    - userEmail
    - gcalEventID
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Create Booking - Creates a new booking in the system
description: Creates a booking with idempotency check, availability validation,
  and Google Calendar integration
args:
  - type: integer
    name: providerID
    required: true
  - type: integer
    name: serviceID
    required: true
  - type: string
    name: startTime
    required: true
  - type: string
    name: chatID
    required: true
  - type: string
    name: userName
    required: false
  - type: string
    name: userEmail
    required: false
  - type: string
    name: gcalEventID
    required: false
entrypoint: main
language: go
path: f/booking-create/main.go
[0m[39m
[34m[33m~ script f/booking-orchestrator/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/booking-orchestrator/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    chatID:
      type: string
      description: ''
      default: null
      originalType: string
    providerID:
      type: integer
      description: ''
      default: null
    serviceID:
      type: integer
      description: ''
      default: null
    startTime:
      type: string
      description: ''
      default: null
      originalType: string
    userEmail:
      type: string
      description: ''
      default: null
      originalType: string
    userName:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - providerID
    - serviceID
    - startTime
    - chatID
    - userName
    - userEmail
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Booking Orchestrator - Main orchestration flow for bookings
description: Executes the complete booking creation flow with circuit breaker,
  distributed locks, and availability checks
args:
  - type: integer
    name: providerID
    required: true
  - type: integer
    name: serviceID
    required: true
  - type: string
    name: startTime
    required: true
  - type: string
    name: chatID
    required: true
  - type: string
    name: userName
    required: false
  - type: string
    name: userEmail
    required: false
entrypoint: main
language: go
path: f/booking-orchestrator/main.go
[0m[39m
[34m[33m~ script f/booking-reschedule/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/booking-reschedule/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    bookingID:
      type: string
      description: ''
      default: null
      originalType: string
    newStartTime:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - bookingID
    - newStartTime
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Reschedule Booking - Reagenda una reserva existente
description: Changes the start time of an existing booking with availability validation
args:
  - type: string
    name: bookingID
    required: true
  - type: string
    name: newStartTime
    required: true
entrypoint: main
language: go
path: f/booking-reschedule/main.go
[0m[39m
[34m[33m~ script f/circuit-breaker-check/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/circuit-breaker-check/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    serviceID:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - serviceID
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Circuit Breaker Check - Verifica el estado del circuit breaker
description: Checks if a service (e.g., Google Calendar) is available for requests
args:
  - type: string
    name: serviceID
    required: false
entrypoint: main
language: go
path: f/circuit-breaker-check/main.go
[0m[39m
[34m[33m~ script f/circuit-breaker-record/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/circuit-breaker-record/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    errorMessage:
      type: string
      description: ''
      default: null
      originalType: string
    result:
      type: string
      description: ''
      default: null
      originalType: string
    serviceID:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - serviceID
    - result
    - errorMessage
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Circuit Breaker Record - Registra resultado de operación
description: Records success or failure for circuit breaker state management
args:
  - type: string
    name: serviceID
    required: false
  - type: string
    name: result
    enum:
      - success
      - failure
    required: true
  - type: string
    name: errorMessage
    required: false
entrypoint: main
language: go
path: f/circuit-breaker-record/main.go
[0m[39m
[34m[33m~ script f/distributed-lock-acquire/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/distributed-lock-acquire/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    lockDurationMinutes:
      type: integer
      description: ''
      default: null
    providerID:
      type: integer
      description: ''
      default: null
    startTime:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - providerID
    - startTime
    - lockDurationMinutes
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Distributed Lock Acquire - Adquiere un lock distribuido
description: Acquires a distributed lock for a provider time slot to prevent double booking
args:
  - type: integer
    name: providerID
    required: true
  - type: string
    name: startTime
    required: true
  - type: integer
    name: lockDurationMinutes
    required: false
entrypoint: main
language: go
path: f/distributed-lock-acquire/main.go
[0m[39m
[34m[33m~ script f/distributed-lock-release/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/distributed-lock-release/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    lockKey:
      type: string
      description: ''
      default: null
      originalType: string
    ownerToken:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - lockKey
    - ownerToken
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Distributed Lock Release - Libera un lock distribuido
description: Releases a previously acquired distributed lock
args:
  - type: string
    name: lockKey
    required: true
  - type: string
    name: ownerToken
    required: true
entrypoint: main
language: go
path: f/distributed-lock-release/main.go
[0m[39m
[34m[33m~ script f/gcal-create-event/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/gcal-create-event/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    description:
      type: string
      description: ''
      default: null
      originalType: string
    calendarID:
      type: string
      description: ''
      default: null
      originalType: string
    startTime:
      type: string
      description: ''
      default: null
      originalType: string
    title:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - startTime
    - title
    - description
    - calendarID
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Google Calendar Create Event - Crea evento en Google Calendar
description: Creates a new event in Google Calendar with specified details
args:
  - type: string
    name: startTime
    required: true
  - type: string
    name: title
    required: true
  - type: string
    name: description
    required: false
  - type: string
    name: calendarID
    required: false
entrypoint: main
language: go
path: f/gcal-create-event/main.go
[0m[39m
[34m[33m~ script f/gcal-delete-event/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/gcal-delete-event/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    calendarID:
      type: string
      description: ''
      default: null
      originalType: string
    eventID:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - eventID
    - calendarID
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Google Calendar Delete Event - Elimina evento de Google Calendar
description: Deletes an existing event from Google Calendar by event ID
args:
  - type: string
    name: eventID
    required: true
  - type: string
    name: calendarID
    required: false
entrypoint: main
language: go
path: f/gcal-delete-event/main.go
[0m[39m
[34m[33m~ script f/get-providers-by-service/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/get-providers-by-service/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    serviceID:
      type: integer
      description: ''
      default: null
  required:
    - serviceID
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Get Providers by Service - Obtiene proveedores por servicio
description: Returns providers that offer a specific service
args:
  - type: integer
    name: serviceID
    required: true
entrypoint: main
language: go
path: f/get-providers-by-service/main.go
[0m[39m
[34m[33m~ script f/get-providers/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/get-providers/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties: {}
  required: []
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Get Providers - Obtiene todos los proveedores activos
description: Returns a list of all active providers in the system
args: []
entrypoint: main
language: go
path: f/get-providers/main.go
[0m[39m
[34m[33m~ script f/get-services-by-provider/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/get-services-by-provider/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    providerID:
      type: integer
      description: ''
      default: null
  required:
    - providerID
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Get Services by Provider - Obtiene servicios por proveedor
description: Returns services offered by a specific provider
args:
  - type: integer
    name: providerID
    required: true
entrypoint: main
language: go
path: f/get-services-by-provider/main.go
[0m[39m
[34m[33m~ script f/get-services/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/get-services/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties: {}
  required: []
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Get Services - Obtiene todos los servicios activos
description: Returns a list of all active services in the system
args: []
entrypoint: main
language: go
path: f/get-services/main.go
[0m[39m
[34m[33m~ script f/gmail-send/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/gmail-send/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    bccEmails:
      type: string
      description: ''
      default: null
      originalType: string
    body:
      type: string
      description: ''
      default: null
      originalType: string
    ccEmails:
      type: string
      description: ''
      default: null
      originalType: string
    isHTML:
      type: boolean
      description: ''
      default: null
    replyToEmail:
      type: string
      description: ''
      default: null
      originalType: string
    subject:
      type: string
      description: ''
      default: null
      originalType: string
    toEmail:
      type: string
      description: ''
      default: null
      originalType: string
    toName:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - toEmail
    - subject
    - body
    - isHTML
    - toName
    - ccEmails
    - bccEmails
    - replyToEmail
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Gmail Send - Envía emails vía Gmail SMTP
description: Sends an email using Gmail SMTP with HTML or plain text support
args:
  - type: string
    name: toEmail
    required: true
  - type: string
    name: subject
    required: true
  - type: string
    name: body
    required: true
  - type: boolean
    name: isHTML
    required: false
  - type: string
    name: toName
    required: false
  - type: string
    name: ccEmailes
    required: false
  - type: string
    name: bccEmails
    required: false
  - type: string
    name: replyToEmail
    required: false
entrypoint: main
language: go
path: f/gmail-send/main.go
[0m[39m
[34m[32m+ script f/internal/ai_agent/main.script.lock[90m[32m[39m[39m
[34m[32m+ script f/internal/ai_agent/main.script.yaml[90m[32m[39m[39m
[34m[32m+ script f/internal/ai_agent/main.ts[90m[32m[39m[39m
[34m[32m+ script f/internal/message_parser/main.script.lock[90m[32m[39m[39m
[34m[32m+ script f/internal/message_parser/main.script.yaml[90m[32m[39m[39m
[34m[32m+ script f/internal/message_parser/main.ts[90m[32m[39m[39m
[34m[33m~ script f/telegram-send/main.script.yaml[90m[33m[39m[39m
[34m[31msummary: ''
description: ''
lock: '!inline f/telegram-send/main.script.lock'
kind: script
schema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  properties:
    chatID:
      type: string
      description: ''
      default: null
      originalType: string
    parseMode:
      type: string
      description: ''
      default: null
      originalType: string
    text:
      type: string
      description: ''
      default: null
      originalType: string
  required:
    - chatID
    - text
    - parseMode
[0m[32m$schema: https://windmill.dev/metadata/script.json
summary: Telegram Send - Envía mensajes a Telegram
description: Sends a message to a Telegram chat using bot API
args:
  - type: string
    name: chatID
    required: true
  - type: string
    name: text
    required: true
  - type: string
    name: parseMode
    enum:
      - MarkdownV2
      - HTML
      - plain
    required: false
entrypoint: main
language: go
path: f/telegram-send/main.go
[0m[39m
[34m[32m+ flow f/booking-orchestrator-flow__flow/main.flow.yaml[90m[32m[39m[39m
[34m[32m+ flow f/telegram-webhook__flow/flow.yaml[90m[32m[39m[39m
[34m[90mApplying changes to files ...[39m[39m
[34mfound changes for 38 items with a total of 42 files to process[39m
[33m[1mCreating new folder: availability-check[22m[39m
