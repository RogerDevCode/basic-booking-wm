package booking

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/logging"
	"booking-titanium-wm/pkg/types"
)

var stateLog = logging.GetDefaultLogger()

// ============================================================================
// STATE TRANSITION VALIDATION (v4.0 §5)
// ============================================================================

// TransitionRule defines who can trigger a specific state transition
type TransitionRule struct {
	To          string
	AllowedActors []string // "patient", "provider", "system"
}

// validTransitions defines all allowed state transitions per v4.0 §5
var validTransitions = map[types.BookingStatus][]TransitionRule{
	types.StatusPending: {
		{To: string(types.StatusConfirmed), AllowedActors: []string{"provider", "system"}},
		{To: string(types.StatusCancelled), AllowedActors: []string{"patient", "provider"}},
		{To: string(types.StatusRescheduled), AllowedActors: []string{"patient", "provider"}},
	},
	types.StatusConfirmed: {
		{To: string(types.StatusInService), AllowedActors: []string{"provider"}},
		{To: string(types.StatusCancelled), AllowedActors: []string{"patient", "provider"}},
		{To: string(types.StatusRescheduled), AllowedActors: []string{"patient", "provider"}},
	},
	types.StatusInService: {
		{To: string(types.StatusCompleted), AllowedActors: []string{"provider", "system"}},
		{To: string(types.StatusNoShow), AllowedActors: []string{"provider"}},
	},
	// Terminal states (no transitions allowed)
	types.StatusCompleted:   {},
	types.StatusCancelled:   {},
	types.StatusNoShow:      {},
	types.StatusRescheduled: {},
}

// IsValidTransition checks if a state transition is valid per v4.0 §5
func IsValidTransition(fromStatus, toStatus types.BookingStatus, actor string) error {
	// Check if fromStatus exists in our transition map
	rules, exists := validTransitions[fromStatus]
	if !exists {
		return fmt.Errorf("booking.transition: invalid from_status %q", fromStatus)
	}

	// Find matching transition rule
	for _, rule := range rules {
		if rule.To == string(toStatus) {
			// Check if actor is allowed
			for _, allowed := range rule.AllowedActors {
				if allowed == actor {
					return nil // Valid transition
				}
			}
			return fmt.Errorf("booking.transition: actor %q cannot transition from %q to %q",
				actor, fromStatus, toStatus)
		}
	}

	return fmt.Errorf("booking.transition: invalid transition from %q to %q",
		fromStatus, toStatus)
}

// IsTerminalState returns true if the status is a terminal state
func IsTerminalState(status types.BookingStatus) bool {
	switch status {
	case types.StatusCompleted, types.StatusCancelled, types.StatusNoShow, types.StatusRescheduled:
		return true
	default:
		return false
	}
}

// ============================================================================
// AUDIT TRAIL (v4.0 §10)
// ============================================================================

// CreateAuditEntry creates an audit trail entry for a booking state change
func CreateAuditEntry(
	ctx context.Context,
	tx *sql.Tx,
	bookingID string,
	fromStatus *types.BookingStatus,
	toStatus types.BookingStatus,
	changedBy string,
	actorID *string,
	reason *string,
	metadata map[string]any,
) (string, error) {

	query := `
		INSERT INTO booking_audit (
			booking_id, from_status, to_status, changed_by, actor_id, reason, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING audit_id`

	var auditID string

	// Convert metadata to JSONB
	metadataJSON, err := db.MapToJSONB(metadata)
	if err != nil {
		return "", fmt.Errorf("booking.audit: failed to serialize metadata: %w", err)
	}

	var fromStatusStr *string
	if fromStatus != nil {
		s := string(*fromStatus)
		fromStatusStr = &s
	}

	err = tx.QueryRowContext(
		ctx,
		query,
		bookingID,
		fromStatusStr,
		string(toStatus),
		changedBy,
		actorID,
		reason,
		metadataJSON,
	).Scan(&auditID)

	if err != nil {
		return "", fmt.Errorf("booking.audit: failed to create audit entry: %w", err)
	}

	stateLog.Info("Audit trail created: audit_id=%s booking_id=%s transition=%v->%s actor=%s",
		auditID, bookingID, fromStatus, toStatus, changedBy)

	return auditID, nil
}

// GetAuditTrail retrieves the audit trail for a booking
func GetAuditTrail(ctx context.Context, bookingID string) ([]types.BookingAudit, error) {
	query := `
		SELECT audit_id, booking_id, from_status, to_status, changed_by, 
		       actor_id, reason, metadata, created_at
		FROM booking_audit
		WHERE booking_id = $1
		ORDER BY created_at DESC`

	rows, err := db.GetDB().QueryContext(ctx, query, bookingID)
	if err != nil {
		return nil, fmt.Errorf("booking.audit: failed to query audit trail: %w", err)
	}
	defer rows.Close()

	var audits []types.BookingAudit
	for rows.Next() {
		var audit types.BookingAudit
		var fromStatus sql.NullString
		var reason sql.NullString
		var metadataJSON sql.NullString

		err := rows.Scan(
			&audit.AuditID,
			&audit.BookingID,
			&fromStatus,
			&audit.ToStatus,
			&audit.ChangedBy,
			&audit.ActorID,
			&reason,
			&metadataJSON,
			&audit.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("booking.audit: failed to scan audit entry: %w", err)
		}

		if fromStatus.Valid {
			status := types.BookingStatus(fromStatus.String)
			audit.FromStatus = &status
		}

		if reason.Valid {
			audit.Reason = &reason.String
		}

		if metadataJSON.Valid {
			audit.Metadata, _ = db.JSONBToMap(metadataJSON.String)
		}

		audits = append(audits, audit)
	}

	return audits, nil
}

// ============================================================================
// BOOKING STATE UPDATE WITH AUDIT (v4.0 compliant)
// ============================================================================

// UpdateBookingStatus updates a booking's status with audit trail
func UpdateBookingStatus(
	ctx context.Context,
	tx *sql.Tx,
	bookingID string,
	newStatus types.BookingStatus,
	actor string,
	actorID *string,
	reason *string,
) error {

	// 1. Get current status
	currentStatus, err := getBookingStatus(ctx, tx, bookingID)
	if err != nil {
		return fmt.Errorf("booking.update_status: failed to get current status: %w", err)
	}

	// 2. Validate transition
	if err := IsValidTransition(*currentStatus, newStatus, actor); err != nil {
		return fmt.Errorf("booking.update_status: invalid transition: %w", err)
	}

	// 3. Update booking status
	updateQuery := `
		UPDATE bookings
		SET status = $1, updated_at = NOW()
		WHERE booking_id = $2
		RETURNING booking_id`

	var updatedBookingID string
	err = tx.QueryRowContext(ctx, updateQuery, newStatus, bookingID).Scan(&updatedBookingID)
	if err != nil {
		return fmt.Errorf("booking.update_status: failed to update status: %w", err)
	}

	// 4. Create audit trail
	_, err = CreateAuditEntry(
		ctx,
		tx,
		bookingID,
		currentStatus,
		newStatus,
		actor,
		actorID,
		reason,
		map[string]any{
			"updated_at": time.Now().UTC().Format(time.RFC3339),
		},
	)
	if err != nil {
		return fmt.Errorf("booking.update_status: failed to create audit entry: %w", err)
	}

	stateLog.Info("Booking status updated: booking_id=%s %s->%s by %s",
		bookingID, *currentStatus, newStatus, actor)

	return nil
}

// getBookingStatus retrieves the current status of a booking
func getBookingStatus(ctx context.Context, tx *sql.Tx, bookingID string) (*types.BookingStatus, error) {
	query := `SELECT status FROM bookings WHERE booking_id = $1`

	var status string
	err := tx.QueryRowContext(ctx, query, bookingID).Scan(&status)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("booking.not_found: booking_id=%s", bookingID)
		}
		return nil, fmt.Errorf("booking.get_status: query failed: %w", err)
	}

	bookingStatus := types.BookingStatus(status)
	return &bookingStatus, nil
}

// ============================================================================
// STATE TRANSITION HELPERS
// ============================================================================

// ConfirmBooking transitions a booking from pending to confirmed
func ConfirmBooking(
	ctx context.Context,
	tx *sql.Tx,
	bookingID string,
	actor string, // "provider" or "system"
	actorID *string,
) error {
	return UpdateBookingStatus(ctx, tx, bookingID, types.StatusConfirmed, actor, actorID, nil)
}

// CancelBookingWithAudit transitions a booking to cancelled (internal use, avoids name conflict)
func CancelBookingWithAudit(
	ctx context.Context,
	tx *sql.Tx,
	bookingID string,
	actor string, // "patient" or "provider"
	actorID *string,
	reason string,
) error {
	reasonPtr := &reason
	return UpdateBookingStatus(ctx, tx, bookingID, types.StatusCancelled, actor, actorID, reasonPtr)
}

// StartService transitions a booking from confirmed to in_service
func StartService(
	ctx context.Context,
	tx *sql.Tx,
	bookingID string,
	actorID *string,
) error {
	return UpdateBookingStatus(ctx, tx, bookingID, types.StatusInService, "provider", actorID, nil)
}

// CompleteBooking transitions a booking to completed
func CompleteBooking(
	ctx context.Context,
	tx *sql.Tx,
	bookingID string,
	actorID *string,
) error {
	return UpdateBookingStatus(ctx, tx, bookingID, types.StatusCompleted, "provider", actorID, nil)
}

// MarkNoShow transitions a booking to no_show
func MarkNoShow(
	ctx context.Context,
	tx *sql.Tx,
	bookingID string,
	actorID *string,
	reason string,
) error {
	reasonPtr := &reason
	return UpdateBookingStatus(ctx, tx, bookingID, types.StatusNoShow, "provider", actorID, reasonPtr)
}

// RescheduleBookingWithAudit marks a booking as rescheduled (links to new booking, internal use)
func RescheduleBookingWithAudit(
	ctx context.Context,
	tx *sql.Tx,
	bookingID string,
	newBookingID string,
	actor string, // "patient" or "provider"
	actorID *string,
	reason string,
) error {
	reasonPtr := &reason

	// Update old booking
	err := UpdateBookingStatus(ctx, tx, bookingID, types.StatusRescheduled, actor, actorID, reasonPtr)
	if err != nil {
		return err
	}

	// Link to new booking
	linkQuery := `
		UPDATE bookings
		SET rescheduled_to = $1
		WHERE booking_id = $2`

	_, err = tx.ExecContext(ctx, linkQuery, newBookingID, bookingID)
	if err != nil {
		return fmt.Errorf("booking.reschedule: failed to link to new booking: %w", err)
	}

	return nil
}

// LinkRescheduledFrom links a new booking to its original (rescheduled from)
func LinkRescheduledFrom(
	ctx context.Context,
	tx *sql.Tx,
	newBookingID string,
	originalBookingID string,
) error {
	query := `
		UPDATE bookings
		SET rescheduled_from = $1
		WHERE booking_id = $2`

	_, err := tx.ExecContext(ctx, query, originalBookingID, newBookingID)
	if err != nil {
		return fmt.Errorf("booking.reschedule: failed to link from original: %w", err)
	}

	return nil
}
