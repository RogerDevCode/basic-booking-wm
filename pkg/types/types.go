package types

import (
	"time"
)

// ============================================================================
// PRINCIPAL TYPES (v4.0 COMPLIANT)
// ============================================================================

// BookingStatus representa el estado de una reserva (v4.0 lowercase)
type BookingStatus string

const (
	StatusPending     BookingStatus = "pending"
	StatusConfirmed   BookingStatus = "confirmed"
	StatusInService   BookingStatus = "in_service"
	StatusCompleted   BookingStatus = "completed"
	StatusCancelled   BookingStatus = "cancelled"
	StatusNoShow      BookingStatus = "no_show"
	StatusRescheduled BookingStatus = "rescheduled"
)

// GCalSyncStatus representa el estado de sincronización con Google Calendar
type GCalSyncStatus string

const (
	GCalSyncPending  GCalSyncStatus = "pending"
	GCalSyncSynced   GCalSyncStatus = "synced"
	GCalSyncPartial  GCalSyncStatus = "partial"
	GCalSyncFailed   GCalSyncStatus = "failed"
)

// Booking representa una reserva en el sistema (v5.0 - UUID only)
type Booking struct {
	ID                     string         `json:"id" db:"id"`
	ProviderID             string         `json:"provider_id" db:"provider_id"`               // UUID
	ServiceID              string         `json:"service_id" db:"service_id"`                 // UUID
	PatientID              *string        `json:"patient_id,omitempty" db:"patient_id"`       // UUID
	StartTime              time.Time      `json:"start_time" db:"start_time"`
	EndTime                time.Time      `json:"end_time" db:"end_time"`
	Status                 BookingStatus  `json:"status" db:"status"`
	IdempotencyKey         string         `json:"idempotency_key" db:"idempotency_key"`
	GCalEventID            *string        `json:"gcal_event_id,omitempty" db:"gcal_event_id"`
	GCalProviderEventID    *string        `json:"gcal_provider_event_id,omitempty" db:"gcal_provider_event_id"`
	GCalPatientEventID     *string        `json:"gcal_patient_event_id,omitempty" db:"gcal_patient_event_id"`
	GCalSyncStatus         GCalSyncStatus `json:"gcal_sync_status" db:"gcal_sync_status"`
	GCalRetryCount         int            `json:"gcal_retry_count" db:"gcal_retry_count"`
	GCalLastSync           *time.Time     `json:"gcal_last_sync,omitempty" db:"gcal_last_sync"`
	NotificationSent       bool           `json:"notification_sent" db:"notification_sent"`
	Reminder24hSent        bool           `json:"reminder_24h_sent" db:"reminder_24h_sent"`
	Reminder2hSent         bool           `json:"reminder_2h_sent" db:"reminder_2h_sent"`
	RescheduledFrom        *string        `json:"rescheduled_from,omitempty" db:"rescheduled_from"`
	RescheduledTo          *string        `json:"rescheduled_to,omitempty" db:"rescheduled_to"`
	Notes                  *string        `json:"notes,omitempty" db:"notes"`
	UserID                 *string        `json:"user_id,omitempty" db:"user_id"` // chat_id
	CreatedAt              time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time      `json:"updated_at" db:"updated_at"`
	CancelledAt            *time.Time     `json:"cancelled_at,omitempty" db:"cancelled_at"`
	CancellationReason     *string        `json:"cancellation_reason,omitempty" db:"cancellation_reason"`
}

// Provider representa un proveedor de servicios (v5.0 - UUID only)
type Provider struct {
	ID             string     `json:"id" db:"id"` // UUID
	Name           string     `json:"name" db:"name"`
	Email          string     `json:"email" db:"email"`
	Specialty      *string    `json:"specialty,omitempty" db:"specialty"`
	Phone          *string    `json:"phone,omitempty" db:"phone"`
	Timezone       string     `json:"timezone" db:"timezone"`
	IsActive       bool       `json:"is_active" db:"is_active"`
	GCalCalendarID *string    `json:"gcal_calendar_id,omitempty" db:"gcal_calendar_id"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}

// Service representa un servicio ofrecido (v5.0 - UUID only)
type Service struct {
	ID                  string    `json:"id" db:"id"` // UUID
	ProviderID          string    `json:"provider_id" db:"provider_id"`
	Name                string    `json:"name" db:"name"`
	Description         *string   `json:"description,omitempty" db:"description"`
	DurationMinutes     int       `json:"duration_minutes" db:"duration_min"`
	BufferMinutes       int       `json:"buffer_minutes" db:"buffer_min"`
	MinLeadBookingHours int       `json:"min_lead_booking_hours" db:"min_lead_booking_hours"`
	MinLeadCancelHours  int       `json:"min_lead_cancel_hours" db:"min_lead_cancel_hours"`
	Price               float64   `json:"price" db:"price"`
	Currency            string    `json:"currency" db:"currency"`
	IsActive            bool      `json:"is_active" db:"is_active"`
	CreatedAt           time.Time `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time `json:"updated_at" db:"updated_at"`
}

// Patient representa un paciente (v4.0 NEW)
type Patient struct {
	PatientID      string            `json:"patient_id" db:"patient_id"`
	Name           string            `json:"name" db:"name"`
	Email          *string           `json:"email,omitempty" db:"email"`
	Phone          *string           `json:"phone,omitempty" db:"phone"`
	TelegramChatID *string           `json:"telegram_chat_id,omitempty" db:"telegram_chat_id"`
	GCalCalendarID *string           `json:"gcal_calendar_id,omitempty" db:"gcal_calendar_id"`
	Timezone       string            `json:"timezone" db:"timezone"`
	Metadata       map[string]any    `json:"metadata,omitempty" db:"metadata"`
	CreatedAt      time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at" db:"updated_at"`
}

// ProviderSchedule representa la disponibilidad semanal de un proveedor (v4.0 NEW)
type ProviderSchedule struct {
	ScheduleID        string    `json:"schedule_id" db:"schedule_id"`
	ProviderID        string    `json:"provider_id" db:"provider_id"`
	DayOfWeek         int       `json:"day_of_week" db:"day_of_week"` // 0=Sunday, 6=Saturday
	StartTime         string    `json:"start_time" db:"start_time"`   // "09:00"
	EndTime           string    `json:"end_time" db:"end_time"`       // "17:00"
	ServiceDurationMin int      `json:"service_duration_min" db:"service_duration_min"`
	BufferTimeMin     int       `json:"buffer_time_min" db:"buffer_time_min"`
	IsActive          bool      `json:"is_active" db:"is_active"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
}

// ScheduleOverride representa overrides de horario (vacaciones, festivos) (v4.0 NEW)
type ScheduleOverride struct {
	OverrideID   string    `json:"override_id" db:"override_id"`
	ProviderID   string    `json:"provider_id" db:"provider_id"`
	OverrideDate time.Time `json:"override_date" db:"override_date"`
	IsBlocked    bool      `json:"is_blocked" db:"is_blocked"`
	StartTime    *string   `json:"start_time,omitempty" db:"start_time"`
	EndTime      *string   `json:"end_time,omitempty" db:"end_time"`
	Reason       *string   `json:"reason,omitempty" db:"reason"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

// BookingAudit representa el audit trail de cambios (v4.0 NEW)
type BookingAudit struct {
	AuditID    string         `json:"audit_id" db:"audit_id"`
	BookingID  string         `json:"booking_id" db:"booking_id"`
	FromStatus *BookingStatus `json:"from_status,omitempty" db:"from_status"`
	ToStatus   BookingStatus  `json:"to_status" db:"to_status"`
	ChangedBy  string         `json:"changed_by" db:"changed_by"` // 'patient', 'provider', 'system'
	ActorID    *string        `json:"actor_id,omitempty" db:"actor_id"`
	Reason     *string        `json:"reason,omitempty" db:"reason"`
	Metadata   map[string]any `json:"metadata,omitempty" db:"metadata"`
	CreatedAt  time.Time      `json:"created_at" db:"created_at"`
}

// KnowledgeBaseEntry representa una entrada en la base de conocimiento RAG (v4.0 NEW)
type KnowledgeBaseEntry struct {
	KBID       string    `json:"kb_id" db:"kb_id"`
	ProviderID *string   `json:"provider_id,omitempty" db:"provider_id"`
	Category   string    `json:"category" db:"category"` // 'servicios', 'ubicacion', 'politicas', 'FAQ', 'general'
	Title      string    `json:"title" db:"title"`
	Content    string    `json:"content" db:"content"`
	Embedding  []float32 `json:"embedding,omitempty" db:"embedding"` // pgvector(1536)
	IsActive   bool      `json:"is_active" db:"is_active"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time `json:"updated_at" db:"updated_at"`
}

// Conversation representa un mensaje en la conversación (v4.0 NEW)
type Conversation struct {
	MessageID string         `json:"message_id" db:"message_id"`
	PatientID *string        `json:"patient_id,omitempty" db:"patient_id"`
	Channel   string         `json:"channel" db:"channel"` // 'telegram', 'web', 'api'
	Direction string         `json:"direction" db:"direction"` // 'incoming', 'outgoing'
	Content   string         `json:"content" db:"content"`
	Intent    *string        `json:"intent,omitempty" db:"intent"`
	Metadata  map[string]any `json:"metadata,omitempty" db:"metadata"`
	CreatedAt time.Time      `json:"created_at" db:"created_at"`
}

// Slot representa un slot de tiempo disponible
type Slot struct {
	ProviderID string    `json:"provider_id"`
	ServiceID  string    `json:"service_id"`
	StartTime  time.Time `json:"start_time"`
	EndTime    time.Time `json:"end_time"`
	Available  bool      `json:"available"`
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

// CreateBookingRequest representa una solicitud para crear una reserva
type CreateBookingRequest struct {
	ProviderID string `json:"provider_id"`
	ServiceID  string `json:"service_id"`
	StartTime  string `json:"start_time"` // ISO 8601
	ChatID     string `json:"chat_id"`
	UserName   string `json:"user_name,omitempty"`
	UserEmail  string `json:"user_email,omitempty"`
}

// CancelBookingRequest representa una solicitud para cancelar una reserva
type CancelBookingRequest struct {
	BookingID          string  `json:"booking_id"`
	CancellationReason *string `json:"cancellation_reason,omitempty"`
}

// RescheduleBookingRequest representa una solicitud para reagendar una reserva
type RescheduleBookingRequest struct {
	BookingID    string `json:"booking_id"`
	NewStartTime string `json:"new_start_time"` // ISO 8601
}

// CheckAvailabilityRequest representa una solicitud para verificar disponibilidad
type CheckAvailabilityRequest struct {
	ProviderID string `json:"provider_id"`
	ServiceID  string `json:"service_id"`
	Date       string `json:"date"` // YYYY-MM-DD
}

// FindNextAvailableRequest representa una solicitud para encontrar el próximo disponible
type FindNextAvailableRequest struct {
	ProviderID string `json:"provider_id"`
	ServiceID  string `json:"service_id"`
	Date       string `json:"date"` // YYYY-MM-DD
}

// ============================================================================
// STANDARD CONTRACT RESPONSE
// ============================================================================

// ResponseMetadata contiene metadata de la respuesta
type ResponseMetadata struct {
	Source     string `json:"source"`
	Timestamp  string `json:"timestamp"`
	WorkflowID string `json:"workflow_id,omitempty"`
	Version    string `json:"version,omitempty"`
}

// StandardContractResponse es el formato estándar para todas las respuestas
type StandardContractResponse[T any] struct {
	Success      bool             `json:"success"`
	ErrorCode    *string          `json:"error_code,omitempty"`
	ErrorMessage *string          `json:"error_message,omitempty"`
	Data         *T               `json:"data,omitempty"`
	Meta         ResponseMetadata `json:"_meta"`
}

// ============================================================================
// ERROR CODES
// ============================================================================

var (
	// Validation errors
	ErrorCodeValidationError = "VALIDATION_ERROR"
	ErrorCodeMissingField    = "MISSING_FIELD"
	ErrorCodeInvalidType     = "INVALID_TYPE"
	ErrorCodeInvalidInput    = "INVALID_INPUT"
	ErrorCodeInvalidDate     = "INVALID_DATE"
	ErrorCodeInvalidDatetime = "INVALID_DATETIME"
	ErrorCodeInvalidUUID     = "INVALID_UUID"

	// Booking errors
	ErrorCodeBookingNotFound         = "BOOKING_NOT_FOUND"
	ErrorCodeBookingAlreadyCancelled = "BOOKING_ALREADY_CANCELLED"
	ErrorCodeBookingAlreadyExists    = "BOOKING_ALREADY_EXISTS"
	ErrorCodeDuplicateIdempotencyKey = "DUPLICATE_IDEMPOTENCY_KEY"

	// Availability errors
	ErrorCodeNoAvailability  = "NO_AVAILABILITY"
	ErrorCodeSlotUnavailable = "SLOT_UNAVAILABLE"

	// External service errors
	ErrorCodeGCalError     = "GCAL_ERROR"
	ErrorCodeGCalCollision = "GCAL_COLLISION"
	ErrorCodeTelegramError = "TELEGRAM_ERROR"
	ErrorCodeGmailError    = "GMAIL_ERROR"

	// Infrastructure errors
	ErrorCodeCircuitBreakerOpen = "CIRCUIT_BREAKER_OPEN"
	ErrorCodeLockHeld           = "LOCK_HELD"
	ErrorCodeLockDenied         = "LOCK_DENIED"
	ErrorCodeDBError            = "DB_ERROR"
	ErrorCodeDBConnectionError  = "DB_CONNECTION_ERROR"
	ErrorCodeDBTimeout          = "DB_TIMEOUT"

	// System errors
	ErrorCodeInternalError     = "INTERNAL_ERROR"
	ErrorCodePipelineError     = "PIPELINE_ERROR"
	ErrorCodeOrchestratorError = "ORCHESTRATOR_ERROR"
)

// ============================================================================
// CIRCUIT BREAKER TYPES
// ============================================================================

// CircuitBreakerState representa el estado de un circuit breaker
type CircuitBreakerState struct {
	ServiceID        string     `json:"service_id" db:"service_id"`
	State            string     `json:"state" db:"state"` // closed, open, half-open
	FailureCount     int        `json:"failure_count" db:"failure_count"`
	SuccessCount     int        `json:"success_count" db:"success_count"`
	FailureThreshold int        `json:"failure_threshold" db:"failure_threshold"`
	SuccessThreshold int        `json:"success_threshold" db:"success_threshold"`
	TimeoutSeconds   int        `json:"timeout_seconds" db:"timeout_seconds"`
	OpenedAt         *time.Time `json:"opened_at,omitempty" db:"opened_at"`
	HalfOpenAt       *time.Time `json:"half_open_at,omitempty" db:"half_open_at"`
	LastFailureAt    *time.Time `json:"last_failure_at,omitempty" db:"last_failure_at"`
	LastSuccessAt    *time.Time `json:"last_success_at,omitempty" db:"last_success_at"`
	LastErrorMessage *string    `json:"last_error_message,omitempty" db:"last_error_message"`
}

// CircuitBreakerCheckResponse es la respuesta de verificar el circuit breaker
type CircuitBreakerCheckResponse struct {
	Allowed           bool   `json:"allowed"`
	CircuitState      string `json:"circuit_state"`
	Message           string `json:"message"`
	FailureCount      int    `json:"failure_count"`
	ServiceID         string `json:"service_id"`
	RetryAfterSeconds *int   `json:"retry_after_seconds,omitempty"`
}

// ============================================================================
// DISTRIBUTED LOCK TYPES
// ============================================================================

// BookingLock representa un lock distribuido para bookings
type BookingLock struct {
	LockID     int       `json:"lock_id" db:"lock_id"`
	LockKey    string    `json:"lock_key" db:"lock_key"`
	OwnerToken string    `json:"owner_token" db:"owner_token"`
	ProviderID int       `json:"provider_id" db:"provider_id"`
	StartTime  time.Time `json:"start_time" db:"start_time"`
	AcquiredAt time.Time `json:"acquired_at" db:"acquired_at"`
	ExpiresAt  time.Time `json:"expires_at" db:"expires_at"`
}

// AcquireLockRequest es la solicitud para adquirir un lock
type AcquireLockRequest struct {
	ProviderID          int     `json:"provider_id"`
	StartTime           string  `json:"start_time"`
	LockDurationMinutes *int    `json:"lock_duration_minutes,omitempty"`
	OwnerToken          *string `json:"owner_token,omitempty"`
}

// AcquireLockResponse es la respuesta de adquirir un lock
type AcquireLockResponse struct {
	Acquired   bool       `json:"acquired"`
	LockID     *int       `json:"lock_id,omitempty"`
	LockKey    *string    `json:"lock_key,omitempty"`
	OwnerToken *string    `json:"owner_token,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	RetryAfter *string    `json:"retry_after,omitempty"`
	Message    string     `json:"message"`
}

// ReleaseLockRequest es la solicitud para liberar un lock
type ReleaseLockRequest struct {
	LockKey    string `json:"lock_key"`
	OwnerToken string `json:"owner_token"`
}

// ReleaseLockResponse es la respuesta de liberar un lock
type ReleaseLockResponse struct {
	Released bool   `json:"released"`
	LockKey  string `json:"lock_key"`
	Message  string `json:"message"`
}

// ============================================================================
// DLQ TYPES
// ============================================================================

// DLQEntry representa una entrada en la Dead Letter Queue
type DLQEntry struct {
	ID              int            `json:"id" db:"id"`
	BookingID       *int           `json:"booking_id,omitempty" db:"booking_id"`
	ProviderID      *int           `json:"provider_id,omitempty" db:"provider_id"`
	ServiceID       *int           `json:"service_id,omitempty" db:"service_id"`
	FailureReason   string         `json:"failure_reason" db:"failure_reason"`
	ErrorMessage    string         `json:"error_message" db:"error_message"`
	ErrorStack      *string        `json:"error_stack,omitempty" db:"error_stack"`
	OriginalPayload map[string]any `json:"original_payload" db:"original_payload"`
	IdempotencyKey  string         `json:"idempotency_key" db:"idempotency_key"`
	Status          string         `json:"status" db:"status"` // pending, resolved, discarded
	CreatedAt       time.Time      `json:"created_at" db:"created_at"`
	ResolvedAt      *time.Time     `json:"resolved_at,omitempty" db:"resolved_at"`
	ResolvedBy      *string        `json:"resolved_by,omitempty" db:"resolved_by"`
	ResolutionNotes *string        `json:"resolution_notes,omitempty" db:"resolution_notes"`
}

// DLQAddRequest es la solicitud para añadir una entrada a la DLQ
type DLQAddRequest struct {
	BookingID       *int           `json:"booking_id,omitempty"`
	ProviderID      *int           `json:"provider_id,omitempty"`
	ServiceID       *int           `json:"service_id,omitempty"`
	FailureReason   string         `json:"failure_reason"`
	ErrorMessage    string         `json:"error_message"`
	ErrorStack      *string        `json:"error_stack,omitempty"`
	OriginalPayload map[string]any `json:"original_payload"`
	IdempotencyKey  *string        `json:"idempotency_key,omitempty"`
}

// DLQAddResponse es la respuesta de añadir a la DLQ
type DLQAddResponse struct {
	DLQID          int    `json:"dlq_id"`
	IdempotencyKey string `json:"idempotency_key"`
}

// DLQStatusResponse es la respuesta del estado de la DLQ
type DLQStatusResponse struct {
	PendingCount   int `json:"pending_count"`
	ResolvedCount  int `json:"resolved_count"`
	DiscardedCount int `json:"discarded_count"`
	TotalItems     int `json:"total_items"`
}
