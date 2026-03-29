package communication

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/logging"
)

var reminderLog = logging.GetDefaultLogger()

// ============================================================================
// CONSTANTS
// ============================================================================

const (
	// Reminder windows
	Reminder24hWindowStart = 23 * time.Hour
	Reminder24hWindowEnd   = 25 * time.Hour
	Reminder2hWindowStart  = 1*time.Hour + 50*time.Minute
	Reminder2hWindowEnd    = 2*time.Hour + 10*time.Minute

	// Batch size for processing reminders
	ReminderBatchSize = 100
)

// ReminderResult represents the result of a reminder cron run
type ReminderResult struct {
	Reminders24hSent int `json:"reminders_24h_sent"`
	Reminders2hSent  int `json:"reminders_2h_sent"`
	Errors24h        int `json:"errors_24h"`
	Errors2h         int `json:"errors_2h"`
	TotalProcessed   int `json:"total_processed"`
	Timestamp        string `json:"timestamp"`
}

// ============================================================================
// REMINDER CRON JOB (v4.0 §8.4)
// ============================================================================

// SendBookingReminders is a cron job that sends appointment reminders
// Schedule: 0 * * * * (every hour)
func SendBookingReminders() (*ReminderResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	result := &ReminderResult{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	reminderLog.Info("Starting reminder cron job")

	// Send 24h reminders
	reminders24h, errors24h, err := send24hReminders(ctx)
	if err != nil {
		reminderLog.Error("Failed to send 24h reminders: %v", err)
	}
	result.Reminders24hSent = reminders24h
	result.Errors24h = errors24h

	// Send 2h reminders
	reminders2h, errors2h, err := send2hReminders(ctx)
	if err != nil {
		reminderLog.Error("Failed to send 2h reminders: %v", err)
	}
	result.Reminders2hSent = reminders2h
	result.Errors2h = errors2h

	result.TotalProcessed = reminders24h + reminders2h + errors24h + errors2h

	reminderLog.Info("Reminder cron completed: 24h=%d/%d, 2h=%d/%d",
		reminders24h-errors24h, reminders24h,
		reminders2h-errors2h, reminders2h)

	return result, nil
}

// send24hReminders sends reminders for appointments in 24 hours
func send24hReminders(ctx context.Context) (int, int, error) {
	now := time.Now().UTC()
	windowStart := now.Add(Reminder24hWindowStart)
	windowEnd := now.Add(Reminder24hWindowEnd)

	// Query bookings that need 24h reminders
	query := `
		SELECT 
			b.booking_id,
			b.patient_id,
			p.telegram_chat_id,
			p.email as patient_email,
			b.provider_id,
			pr.name as provider_name,
			s.name as service_name,
			b.start_time,
			b.idempotency_key
		FROM bookings b
		INNER JOIN patients p ON b.patient_id = p.patient_id
		INNER JOIN providers pr ON b.provider_id = pr.provider_id
		INNER JOIN services s ON b.service_id = s.service_id
		WHERE b.status = 'confirmed'
		  AND b.start_time >= $1
		  AND b.start_time <= $2
		  AND b.reminder_24h_sent = false
		LIMIT $3`

	rows, err := db.GetDB().QueryContext(ctx, query, windowStart, windowEnd, ReminderBatchSize)
	if err != nil {
		return 0, 0, fmt.Errorf("reminder.24h: query failed: %w", err)
	}
	defer rows.Close()

	sent := 0
	errors := 0

	for rows.Next() {
		var bookingID, providerName, serviceName, startTime, idempotencyKey string
		var patientID, chatID, patientEmail sql.NullString

		err := rows.Scan(
			&bookingID,
			&patientID,
			&chatID,
			&patientEmail,
			&providerName,
			&serviceName,
			&startTime,
			&idempotencyKey,
		)
		if err != nil {
			reminderLog.Error("Failed to scan booking: %v", err)
			errors++
			continue
		}

		// Send Telegram reminder
		if chatID.Valid && chatID.String != "" {
			resp := SendReminderWithRetry(
				chatID.String,
				bookingID,
				serviceName,
				startTime,
				24,
			)

			if resp.Success {
				sent++
				reminderLog.Info("24h reminder sent: booking_id=%s via Telegram", bookingID)
			} else {
				errors++
				reminderLog.Error("24h reminder failed: booking_id=%s via Telegram", bookingID)
			}
		}

		// Send Gmail reminder
		if patientEmail.Valid && patientEmail.String != "" {
			resp := SendConfirmationEmailWithRetry(
				patientEmail.String,
				"", // patient name (could be fetched from patients table)
				bookingID,
				serviceName,
				startTime,
				providerName,
			)

			if resp.Success {
				sent++
				reminderLog.Info("24h reminder sent: booking_id=%s via Gmail", bookingID)
			} else {
				errors++
				reminderLog.Error("24h reminder failed: booking_id=%s via Gmail", bookingID)
			}
		}

		// Mark reminder as sent
		if sent > 0 || errors > 0 {
			mark24hReminderSent(ctx, bookingID)
		}
	}

	return sent, errors, nil
}

// send2hReminders sends reminders for appointments in 2 hours
func send2hReminders(ctx context.Context) (int, int, error) {
	now := time.Now().UTC()
	windowStart := now.Add(Reminder2hWindowStart)
	windowEnd := now.Add(Reminder2hWindowEnd)

	// Query bookings that need 2h reminders (Telegram only)
	query := `
		SELECT 
			b.booking_id,
			p.telegram_chat_id,
			s.name as service_name,
			b.start_time
		FROM bookings b
		INNER JOIN patients p ON b.patient_id = p.patient_id
		INNER JOIN services s ON b.service_id = s.service_id
		WHERE b.status = 'confirmed'
		  AND b.start_time >= $1
		  AND b.start_time <= $2
		  AND b.reminder_2h_sent = false
		LIMIT $3`

	rows, err := db.GetDB().QueryContext(ctx, query, windowStart, windowEnd, ReminderBatchSize)
	if err != nil {
		return 0, 0, fmt.Errorf("reminder.2h: query failed: %w", err)
	}
	defer rows.Close()

	sent := 0
	errors := 0

	for rows.Next() {
		var bookingID, serviceName, startTime string
		var chatID sql.NullString

		err := rows.Scan(
			&bookingID,
			&chatID,
			&serviceName,
			&startTime,
		)
		if err != nil {
			reminderLog.Error("Failed to scan booking: %v", err)
			errors++
			continue
		}

		// Send Telegram reminder (2h reminder is Telegram only)
		if chatID.Valid && chatID.String != "" {
			text := fmt.Sprintf(
				"⏰ *Recordatorio Inmediato*\n\n"+
					"📋 Tu cita es en *2 horas*:\n"+
					"Servicio: %s\n"+
					"Hora: %s\n\n"+
					"¡Te esperamos! 👋",
				serviceName,
				formatTime(startTime),
			)

			resp := SendMessageWithRetry(chatID.String, text, "MarkdownV2")

			if resp.Success {
				sent++
				reminderLog.Info("2h reminder sent: booking_id=%s", bookingID)
			} else {
				errors++
				reminderLog.Error("2h reminder failed: booking_id=%s", bookingID)
			}
		}

		// Mark reminder as sent
		if sent > 0 || errors > 0 {
			mark2hReminderSent(ctx, bookingID)
		}
	}

	return sent, errors, nil
}

// mark24hReminderSent marks the 24h reminder as sent in the database
func mark24hReminderSent(ctx context.Context, bookingID string) error {
	query := `
		UPDATE bookings
		SET reminder_24h_sent = true, updated_at = NOW()
		WHERE booking_id = $1`

	_, err := db.GetDB().ExecContext(ctx, query, bookingID)
	if err != nil {
		reminderLog.Error("Failed to mark 24h reminder sent: booking_id=%s, error=%v", bookingID, err)
		return fmt.Errorf("reminder.mark24h: update failed: %w", err)
	}

	return nil
}

// mark2hReminderSent marks the 2h reminder as sent in the database
func mark2hReminderSent(ctx context.Context, bookingID string) error {
	query := `
		UPDATE bookings
		SET reminder_2h_sent = true, updated_at = NOW()
		WHERE booking_id = $1`

	_, err := db.GetDB().ExecContext(ctx, query, bookingID)
	if err != nil {
		reminderLog.Error("Failed to mark 2h reminder sent: booking_id=%s, error=%v", bookingID, err)
		return fmt.Errorf("reminder.mark2h: update failed: %w", err)
	}

	return nil
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// formatTime formats a time string for display
func formatTime(timeStr string) string {
	t, err := time.Parse(time.RFC3339, timeStr)
	if err != nil {
		return timeStr
	}
	return t.Format("02 Jan 2006 at 15:04 MST")
}
