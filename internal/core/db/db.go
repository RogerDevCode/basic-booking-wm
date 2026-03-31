package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"booking-titanium-wm/pkg/types"
	_ "github.com/lib/pq"
)

// ============================================================================
// CONFIGURATION
// ============================================================================

type DBConfig struct {
	ConnectionString string
	MaxOpenConns     int
	MaxIdleConns     int
	ConnMaxLifetime  time.Duration
	ConnMaxIdleTime  time.Duration
}

func GetDefaultConfig() DBConfig {
	maxOpenConns, _ := strconv.Atoi(os.Getenv("DATABASE_MAX_OPEN_CONNS"))
	if maxOpenConns == 0 {
		maxOpenConns = 10
	}

	maxIdleConns, _ := strconv.Atoi(os.Getenv("DATABASE_MAX_IDLE_CONNS"))
	if maxIdleConns == 0 {
		maxIdleConns = 10
	}

	connMaxLifetime, _ := time.ParseDuration(os.Getenv("DATABASE_CONN_MAX_LIFETIME"))
	if connMaxLifetime == 0 {
		connMaxLifetime = 30 * time.Minute
	}

	connMaxIdleTime, _ := time.ParseDuration(os.Getenv("DATABASE_CONN_MAX_IDLE_TIME"))
	if connMaxIdleTime == 0 {
		connMaxIdleTime = 10 * time.Minute
	}

	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		// Fallback for local development if not set
		connStr = "postgresql://booking:booking123@localhost:5432/bookings?sslmode=disable"
	}

	return DBConfig{
		ConnectionString: connStr,
		MaxOpenConns:     maxOpenConns,
		MaxIdleConns:     maxIdleConns,
		ConnMaxLifetime:  connMaxLifetime,
		ConnMaxIdleTime:  connMaxIdleTime,
	}
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

var (
	dbInstance *sql.DB
	once       sync.Once
	mu         sync.RWMutex
)

// InitDB inicializa la conexión a la base de datos
func InitDB(config DBConfig) error {
	mu.Lock()
	defer mu.Unlock()

	if dbInstance != nil {
		return nil
	}

	var err error
	dbInstance, err = sql.Open("postgres", config.ConnectionString)
	if err != nil {
		return fmt.Errorf("failed to open database connection: %w", err)
	}

	// Configure connection pool
	dbInstance.SetMaxOpenConns(config.MaxOpenConns)
	dbInstance.SetMaxIdleConns(config.MaxIdleConns)
	dbInstance.SetConnMaxLifetime(config.ConnMaxLifetime)
	dbInstance.SetConnMaxIdleTime(config.ConnMaxIdleTime)

	// Test connection
	if err := dbInstance.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	fmt.Println("[DB] Database connection established")
	return nil
}

// GetDB returns the database connection, initializing it if necessary
func GetDB() *sql.DB {
	mu.RLock()
	if dbInstance != nil {
		defer mu.RUnlock()
		return dbInstance
	}
	mu.RUnlock()

	once.Do(func() {
		config := GetDefaultConfig()
		if config.ConnectionString != "" {
			_ = InitDB(config)
		}
	})

	return dbInstance
}

// CloseDB cierra la conexión a la base de datos
func CloseDB() error {
	mu.Lock()
	defer mu.Unlock()

	if dbInstance != nil {
		err := dbInstance.Close()
		dbInstance = nil
		fmt.Println("[DB] Database connection closed")
		return err
	}
	return nil
}

// ============================================================================
// BOOKING QUERIES
// ============================================================================

type BookingQueries struct{}

func NewBookingQueries() *BookingQueries {
	return &BookingQueries{}
}

// CheckIdempotency verifica si ya existe un booking con esta idempotency key
func (q *BookingQueries) CheckIdempotency(idempotencyKey string) (*types.Booking, error) {
	query := `
		SELECT id, status, provider_id, service_id, start_time, end_time, 
		       idempotency_key, gcal_event_id, user_id, created_at, updated_at
		FROM bookings 
		WHERE idempotency_key = $1 
		LIMIT 1`

	row := GetDB().QueryRow(query, idempotencyKey)

	var booking types.Booking
	err := row.Scan(
		&booking.ID,
		&booking.Status,
		&booking.ProviderID,
		&booking.ServiceID,
		&booking.StartTime,
		&booking.EndTime,
		&booking.IdempotencyKey,
		&booking.GCalEventID,
		&booking.UserID,
		&booking.CreatedAt,
		&booking.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to check idempotency: %w", err)
	}

	return &booking, nil
}

// Create crea un nuevo booking
func (q *BookingQueries) Create(data CreateBookingData) (*types.Booking, error) {
	query := `
		INSERT INTO bookings (
			provider_id,
			service_id,
			start_time,
			end_time,
			idempotency_key,
			user_id,
			gcal_event_id,
			status,
			created_at,
			updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
		) RETURNING id, status, created_at, updated_at`

	var booking types.Booking
	err := GetDB().QueryRow(
		query,
		data.ProviderID,
		data.ServiceID,
		data.StartTime,
		data.EndTime,
		data.IdempotencyKey,
		data.ChatID,
		data.GCalEventID,
		data.Status,
	).Scan(
		&booking.ID,
		&booking.Status,
		&booking.CreatedAt,
		&booking.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create booking: %w", err)
	}

	booking.ProviderID = data.ProviderID
	booking.ServiceID = data.ServiceID
	booking.StartTime = data.StartTime
	booking.EndTime = data.EndTime
	booking.IdempotencyKey = data.IdempotencyKey
	booking.UserID = &data.ChatID
	booking.GCalEventID = data.GCalEventID

	return &booking, nil
}

// CreateBookingData representa los datos para crear un booking (v5.0 - UUID support)
type CreateBookingData struct {
	ProviderID     string
	ServiceID      string
	StartTime      time.Time
	EndTime        time.Time
	IdempotencyKey string
	ChatID         string
	GCalEventID    *string
	Status         types.BookingStatus
}

// GetByID obtiene un booking por ID
func (q *BookingQueries) GetByID(bookingID string) (*types.Booking, error) {
	query := `
		SELECT id, provider_id, service_id, start_time, end_time, status,
		       idempotency_key, gcal_event_id, user_id, created_at, updated_at,
		       cancelled_at, cancellation_reason
		FROM bookings 
		WHERE id = $1 
		LIMIT 1`

	row := GetDB().QueryRow(query, bookingID)

	var booking types.Booking
	var cancelledAt sql.NullTime
	var cancellationReason sql.NullString

	err := row.Scan(
		&booking.ID,
		&booking.ProviderID,
		&booking.ServiceID,
		&booking.StartTime,
		&booking.EndTime,
		&booking.Status,
		&booking.IdempotencyKey,
		&booking.GCalEventID,
		&booking.UserID,
		&booking.CreatedAt,
		&booking.UpdatedAt,
		&cancelledAt,
		&cancellationReason,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking: %w", err)
	}

	if cancelledAt.Valid {
		booking.CancelledAt = &cancelledAt.Time
	}
	if cancellationReason.Valid {
		booking.CancellationReason = &cancellationReason.String
	}

	return &booking, nil
}

// Cancel cancela un booking
func (q *BookingQueries) Cancel(bookingID string, cancellationReason *string) (*types.Booking, error) {
	query := `
		UPDATE bookings 
		SET status = 'cancelled', 
		    cancelled_at = NOW(), 
		    cancellation_reason = $2,
		    updated_at = NOW()
		WHERE id = $1 
		  AND status != 'cancelled' 
		RETURNING id, status, cancelled_at`

	row := GetDB().QueryRow(query, bookingID, cancellationReason)

	var booking types.Booking
	var cancelledAt time.Time

	err := row.Scan(&booking.ID, &booking.Status, &cancelledAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to cancel booking: %w", err)
	}

	booking.CancelledAt = &cancelledAt
	return &booking, nil
}

// Reschedule reagenda un booking
func (q *BookingQueries) Reschedule(bookingID string, newStartTime time.Time, newEndTime time.Time) (*types.Booking, error) {
	query := `
		UPDATE bookings 
		SET start_time = $2, 
		    end_time = $3, 
		    status = 'RESCHEDULED',
		    updated_at = NOW() 
		WHERE id = $1 
		  AND status != 'CANCELLED' 
		RETURNING id, start_time, end_time, status`

	row := GetDB().QueryRow(query, bookingID, newStartTime, newEndTime)

	var booking types.Booking
	err := row.Scan(&booking.ID, &booking.StartTime, &booking.EndTime, &booking.Status)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to reschedule booking: %w", err)
	}

	return &booking, nil
}

// GetByChatID obtiene los bookings de un chat_id
func (q *BookingQueries) GetByChatID(chatID string, limit int) ([]types.Booking, error) {
	query := `
		SELECT id, provider_id, service_id, start_time, end_time, status,
		       idempotency_key, gcal_event_id, created_at
		FROM bookings 
		WHERE user_id = $1 
		ORDER BY created_at DESC 
		LIMIT $2`

	rows, err := GetDB().Query(query, chatID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get bookings by chat_id: %w", err)
	}
	defer rows.Close()

	var bookings []types.Booking
	for rows.Next() {
		var booking types.Booking
		err := rows.Scan(
			&booking.ID,
			&booking.ProviderID,
			&booking.ServiceID,
			&booking.StartTime,
			&booking.EndTime,
			&booking.Status,
			&booking.IdempotencyKey,
			&booking.GCalEventID,
			&booking.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan booking: %w", err)
		}
		bookings = append(bookings, booking)
	}

	return bookings, nil
}

// ============================================================================
// AVAILABILITY QUERIES
// ============================================================================

type AvailabilityQueries struct{}

func NewAvailabilityQueries() *AvailabilityQueries {
	return &AvailabilityQueries{}
}

// CheckSlotAvailability verifica si un slot está disponible (v5.0 - UUID support)
func (q *AvailabilityQueries) CheckSlotAvailability(providerID, serviceID string, startTime, endTime time.Time) (bool, error) {
	query := `
		SELECT COUNT(*)::int AS count 
		FROM bookings 
		WHERE provider_id = $1 
		  AND service_id = $2 
		  AND status != 'CANCELLED' 
		  AND (
		    (start_time <= $3 AND end_time >= $4)
		    OR (start_time < $4 AND end_time > $3)
		  )`

	var count int
	err := GetDB().QueryRow(query, providerID, serviceID, startTime, endTime).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check slot availability: %w", err)
	}

	return count == 0, nil
}

// GetAvailableSlots obtiene los slots disponibles para una fecha (v5.0 - UUID support)
func (q *AvailabilityQueries) GetAvailableSlots(providerID, serviceID string, date time.Time, durationMinutes int) ([]types.Slot, error) {
	query := `
		WITH time_slots AS (
		  SELECT generate_series(
		    $3::date::timestamp,
		    $3::date::timestamp + INTERVAL '23 hours 59 minutes',
		    ($4 || ' minutes')::interval
		  ) AS slot_start
		)
		SELECT 
		  ts.slot_start AT TIME ZONE 'UTC' AS start_time,
		  (ts.slot_start + ($4 || ' minutes')::interval) AT TIME ZONE 'UTC' AS end_time,
		  CASE 
		    WHEN b.id IS NULL THEN true 
		    ELSE false 
		  END AS is_available
		FROM time_slots ts
		LEFT JOIN bookings b ON 
		  b.provider_id = $1 AND
		  b.service_id = $2 AND
		  b.status != 'CANCELLED' AND
		  b.start_time <= ts.slot_start + ($4 || ' minutes')::interval AND
		  b.start_time >= ts.slot_start - ($4 || ' minutes')::interval
		ORDER BY ts.slot_start`

	rows, err := GetDB().Query(query, providerID, serviceID, date, durationMinutes)
	if err != nil {
		return nil, fmt.Errorf("failed to get available slots: %w", err)
	}
	defer rows.Close()

	var slots []types.Slot
	for rows.Next() {
		var slot types.Slot
		var isAvailable bool
		err := rows.Scan(&slot.StartTime, &slot.EndTime, &isAvailable)
		if err != nil {
			return nil, fmt.Errorf("failed to scan slot: %w", err)
		}
		if isAvailable {
			slot.ProviderID = providerID
			slot.ServiceID = serviceID
			slot.Available = true
			slots = append(slots, slot)
		}
	}

	return slots, nil
}

// ============================================================================
// JSONB HELPERS (for audit trail metadata)
// ============================================================================

// JSONBToMap converts a JSONB string to a map
func JSONBToMap(jsonStr string) (map[string]any, error) {
	var result map[string]any
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return nil, fmt.Errorf("db.jsonb: failed to unmarshal JSON: %w", err)
	}
	return result, nil
}

// MapToJSONB converts a map to JSONB
func MapToJSONB(data map[string]any) (string, error) {
	bytes, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("db.jsonb: failed to marshal JSON: %w", err)
	}
	return string(bytes), nil
}
