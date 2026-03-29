package infrastructure

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// DLQAdd añade una entrada a la DLQ
func DLQAdd(req types.DLQAddRequest) types.StandardContractResponse[types.DLQAddResponse] {
	source := "DLQ_01_Add_Entry"
	workflowID := "dlq-add-v1"
	version := "1.0.0"

	// Validate required fields
	if req.FailureReason == "" {
		return utils.ErrorResponse[types.DLQAddResponse](
			types.ErrorCodeMissingField,
			"failure_reason is required",
			source,
			workflowID,
			version,
		)
	}

	// Prepare idempotency key if not provided
	idempotencyKey := ""
	if req.IdempotencyKey != nil {
		idempotencyKey = *req.IdempotencyKey
	} else {
		idempotencyKey = fmt.Sprintf("dlq_%d_%v", time.Now().UnixNano(), req.BookingID)
	}

	// Marshaling payload
	payloadJSON, err := json.Marshal(req.OriginalPayload)
	if err != nil {
		payloadJSON = []byte("{}")
	}

	// Insert into DB
	query := `
		INSERT INTO booking_dlq (
			booking_id, provider_id, service_id, failure_reason, 
			last_error_message, last_error_stack, original_payload, 
			idempotency_key, status, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
		ON CONFLICT (idempotency_key) DO UPDATE SET
			updated_at = NOW()
		RETURNING dlq_id, idempotency_key
	`

	var dlqID int
	var finalIdempotencyKey string

	err = db.GetDB().QueryRow(
		query,
		req.BookingID,
		req.ProviderID,
		req.ServiceID,
		req.FailureReason,
		req.ErrorMessage,
		req.ErrorStack,
		payloadJSON,
		idempotencyKey,
	).Scan(&dlqID, &finalIdempotencyKey)

	if err != nil {
		return utils.ErrorResponse[types.DLQAddResponse](
			types.ErrorCodeDBError,
			fmt.Sprintf("Failed to add entry to DLQ: %v", err),
			source,
			workflowID,
			version,
		)
	}

	data := types.DLQAddResponse{
		DLQID:          dlqID,
		IdempotencyKey: finalIdempotencyKey,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// DLQGetStatus obtiene el resumen de estado de la DLQ
func DLQGetStatus() types.StandardContractResponse[types.DLQStatusResponse] {
	source := "DLQ_02_Get_Status"
	workflowID := "dlq-status-v1"
	version := "1.0.0"

	query := `
		SELECT 
			COUNT(*) FILTER (WHERE status = 'pending') as pending,
			COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
			COUNT(*) FILTER (WHERE status = 'discarded') as discarded,
			COUNT(*) as total
		FROM booking_dlq
	`

	var status types.DLQStatusResponse

	err := db.GetDB().QueryRow(query).Scan(
		&status.PendingCount,
		&status.ResolvedCount,
		&status.DiscardedCount,
		&status.TotalItems,
	)

	if err != nil {
		return utils.ErrorResponse[types.DLQStatusResponse](
			types.ErrorCodeDBError,
			fmt.Sprintf("Failed to get DLQ status: %v", err),
			source,
			workflowID,
			version,
		)
	}

	return utils.SuccessResponse(status, source, workflowID, version)
}

// DLQGetEntries obtiene entradas de la DLQ filtradas por status
func DLQGetEntries(status string) types.StandardContractResponse[[]types.DLQEntry] {
	source := "DLQ_02_Get_Status"
	workflowID := "dlq-entries-v1"
	version := "1.0.0"

	query := `
		SELECT dlq_id, booking_id, provider_id, service_id, failure_reason, 
		       last_error_message, last_error_stack, original_payload, 
		       idempotency_key, status, created_at, 
		       resolved_at, resolved_by, resolution_notes
		FROM booking_dlq
	`
	var rows *sql.Rows
	var err error

	if status != "" {
		query += " WHERE status = $1 ORDER BY created_at DESC"
		rows, err = db.GetDB().Query(query, status)
	} else {
		query += " ORDER BY created_at DESC LIMIT 50"
		rows, err = db.GetDB().Query(query)
	}

	if err != nil {
		return utils.ErrorResponse[[]types.DLQEntry](
			types.ErrorCodeDBError,
			fmt.Sprintf("Failed to get DLQ entries: %v", err),
			source,
			workflowID,
			version,
		)
	}
	defer rows.Close()

	entries := []types.DLQEntry{}
	for rows.Next() {
		var entry types.DLQEntry
		var payload []byte
		var errorStack, resolvedBy, resolutionNotes sql.NullString
		var resolvedAt sql.NullTime

		err := rows.Scan(
			&entry.ID,
			&entry.BookingID,
			&entry.ProviderID,
			&entry.ServiceID,
			&entry.FailureReason,
			&entry.ErrorMessage,
			&errorStack,
			&payload,
			&entry.IdempotencyKey,
			&entry.Status,
			&entry.CreatedAt,
			&resolvedAt,
			&resolvedBy,
			&resolutionNotes,
		)

		if err != nil {
			continue
		}

		if errorStack.Valid {
			entry.ErrorStack = &errorStack.String
		}
		if resolvedBy.Valid {
			entry.ResolvedBy = &resolvedBy.String
		}
		if resolutionNotes.Valid {
			entry.ResolutionNotes = &resolutionNotes.String
		}
		if resolvedAt.Valid {
			entry.ResolvedAt = &resolvedAt.Time
		}

		json.Unmarshal(payload, &entry.OriginalPayload)
		entries = append(entries, entry)
	}

	return utils.SuccessResponse(entries, source, workflowID, version)
}
