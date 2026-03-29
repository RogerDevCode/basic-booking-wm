package infrastructure

import (
	"database/sql"
	"fmt"
	"time"

	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// DistributedLockQueries maneja las queries de distributed locks
type DistributedLockQueries struct{}

// NewDistributedLockQueries crea una nueva instancia
func NewDistributedLockQueries() *DistributedLockQueries {
	return &DistributedLockQueries{}
}

// Acquire intenta adquirir un lock distribuido
func (q *DistributedLockQueries) Acquire(req types.AcquireLockRequest) (*types.BookingLock, bool, error) {
	// Generate lock_key
	lockKey := fmt.Sprintf("lock_%d_%s", req.ProviderID, req.StartTime)

	// Generate owner_token if not provided
	ownerToken := req.OwnerToken
	if ownerToken == nil || *ownerToken == "" {
		token := fmt.Sprintf("%d_%x", time.Now().UnixNano(), req.ProviderID)
		ownerToken = &token
	}

	// Set lock duration
	lockDuration := 5 // default 5 minutes
	if req.LockDurationMinutes != nil && *req.LockDurationMinutes > 0 {
		lockDuration = *req.LockDurationMinutes
	}

	query := `
		WITH upsert AS (
			INSERT INTO booking_locks (
				provider_id,
				start_time,
				lock_key,
				owner_token,
				acquired_at,
				expires_at
			) VALUES (
				$1, $2, $3, $4, NOW(), NOW() + ($5::int * INTERVAL '1 minute')
			)
			ON CONFLICT (lock_key) DO UPDATE SET
				provider_id = EXCLUDED.provider_id,
				start_time = EXCLUDED.start_time,
				owner_token = EXCLUDED.owner_token,
				acquired_at = EXCLUDED.acquired_at,
				expires_at = EXCLUDED.expires_at
			WHERE booking_locks.expires_at <= NOW()
			RETURNING lock_id, lock_key, owner_token, acquired_at, expires_at, true as acquired, NULL::timestamptz as retry_after
		)
		SELECT * FROM upsert
		UNION ALL
		SELECT lock_id, lock_key, owner_token, acquired_at, expires_at, false as acquired, expires_at as retry_after
		FROM booking_locks
		WHERE lock_key = $3
		  AND NOT EXISTS (SELECT 1 FROM upsert)
		LIMIT 1`

	row := db.GetDB().QueryRow(
		query,
		req.ProviderID,
		req.StartTime,
		lockKey,
		*ownerToken,
		lockDuration,
	)

	var lock types.BookingLock
	var acquired bool
	var retryAfter sql.NullTime

	err := row.Scan(
		&lock.LockID,
		&lock.LockKey,
		&lock.OwnerToken,
		&lock.AcquiredAt,
		&lock.ExpiresAt,
		&acquired,
		&retryAfter,
	)

	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("failed to acquire lock: %w", err)
	}

	if retryAfter.Valid {
		lock.ExpiresAt = retryAfter.Time
	}

	return &lock, acquired, nil
}

// AcquireSingle intenta adquirir un lock sin provider_id (single-provider)
func (q *DistributedLockQueries) AcquireSingle(req types.AcquireLockRequest) (*types.BookingLock, bool, error) {
	// Generate lock_key without provider_id
	lockKey := fmt.Sprintf("lock_%s", req.StartTime)

	// Generate owner_token if not provided
	ownerToken := req.OwnerToken
	if ownerToken == nil || *ownerToken == "" {
		token := fmt.Sprintf("%d_%x", time.Now().UnixNano(), req.StartTime)
		ownerToken = &token
	}

	// Set lock duration
	lockDuration := 5 // default 5 minutes
	if req.LockDurationMinutes != nil && *req.LockDurationMinutes > 0 {
		lockDuration = *req.LockDurationMinutes
	}

	query := `
		WITH upsert AS (
			INSERT INTO booking_locks (
				start_time,
				lock_key,
				owner_token,
				acquired_at,
				expires_at
			) VALUES (
				$1, $2, $3, NOW(), NOW() + ($4::int * INTERVAL '1 minute')
			)
			ON CONFLICT (lock_key) DO UPDATE SET
				start_time = EXCLUDED.start_time,
				owner_token = EXCLUDED.owner_token,
				acquired_at = EXCLUDED.acquired_at,
				expires_at = EXCLUDED.expires_at
			WHERE booking_locks.expires_at <= NOW()
			RETURNING lock_id, lock_key, owner_token, acquired_at, expires_at, true as acquired, NULL::timestamptz as retry_after
		)
		SELECT * FROM upsert
		UNION ALL
		SELECT lock_id, lock_key, owner_token, acquired_at, expires_at, false as acquired, expires_at as retry_after
		FROM booking_locks
		WHERE lock_key = $2
		  AND NOT EXISTS (SELECT 1 FROM upsert)
		LIMIT 1`

	row := db.GetDB().QueryRow(
		query,
		req.StartTime,
		lockKey,
		*ownerToken,
		lockDuration,
	)

	var lock types.BookingLock
	var acquired bool
	var retryAfter sql.NullTime

	err := row.Scan(
		&lock.LockID,
		&lock.LockKey,
		&lock.OwnerToken,
		&lock.AcquiredAt,
		&lock.ExpiresAt,
		&acquired,
		&retryAfter,
	)

	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("failed to acquire lock: %w", err)
	}

	if retryAfter.Valid {
		lock.ExpiresAt = retryAfter.Time
	}

	return &lock, acquired, nil
}

// Release libera un lock distribuido
func (q *DistributedLockQueries) Release(req types.ReleaseLockRequest) (*types.ReleaseLockResponse, error) {
	query := `
		DELETE FROM booking_locks
		WHERE lock_key = $1::text
		  AND owner_token = $2::text
		RETURNING lock_id, lock_key`

	row := db.GetDB().QueryRow(query, req.LockKey, req.OwnerToken)

	var lockID int
	var lockKey string
	err := row.Scan(&lockID, &lockKey)

	if err == sql.ErrNoRows {
		return &types.ReleaseLockResponse{
			Released: false,
			LockKey:  req.LockKey,
			Message:  "Lock not found or owner_token mismatch",
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to release lock: %w", err)
	}

	return &types.ReleaseLockResponse{
		Released: true,
		LockKey:  lockKey,
		Message:  "Lock released successfully",
	}, nil
}

// Acquire intenta adquirir un lock
func Acquire(providerID int, startTime string, lockDurationMinutes *int, ownerToken *string) types.StandardContractResponse[map[string]any] {
	source := "WF7_Distributed_Lock_System"
	workflowID := "distributed-lock-acquire-v1"
	version := "1.0.0"

	// Validate provider_id
	validation := utils.ValidatePositiveInt(providerID, "provider_id")
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Validate start_time
	validation = utils.ValidateISODateTime(startTime, "start_time")
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Acquire lock
	queries := NewDistributedLockQueries()
	req := types.AcquireLockRequest{
		ProviderID:          providerID,
		StartTime:           startTime,
		LockDurationMinutes: lockDurationMinutes,
		OwnerToken:          ownerToken,
	}

	lock, acquired, err := queries.Acquire(req)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to acquire lock",
			source,
			workflowID,
			version,
		)
	}

	if !acquired {
		data := map[string]any{
			"acquired": false,
			"message":  "Lock is already held by another process",
		}

		if lock != nil {
			data["lock_key"] = lock.LockKey
			if !lock.ExpiresAt.IsZero() {
				retryAfter := time.Until(lock.ExpiresAt).Seconds()
				if retryAfter > 0 {
					data["retry_after"] = fmt.Sprintf("%.0f seconds", retryAfter)
				}
			}
		}

		return utils.SuccessResponse(data, source, workflowID, version)
	}

	data := map[string]any{
		"acquired":    true,
		"lock_id":     lock.LockID,
		"lock_key":    lock.LockKey,
		"owner_token": lock.OwnerToken,
		"expires_at":  lock.ExpiresAt.Format(time.RFC3339),
		"message":     "Lock acquired successfully",
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// Release libera un lock
func Release(lockKey string, ownerToken string) types.StandardContractResponse[map[string]any] {
	source := "WF7_Distributed_Lock_System"
	workflowID := "distributed-lock-release-v1"
	version := "1.0.0"

	// Validate lock_key
	if lockKey == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"lock_key is required",
			source,
			workflowID,
			version,
		)
	}

	// Validate owner_token
	if ownerToken == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"owner_token is required",
			source,
			workflowID,
			version,
		)
	}

	// Release lock
	queries := NewDistributedLockQueries()
	req := types.ReleaseLockRequest{
		LockKey:    lockKey,
		OwnerToken: ownerToken,
	}

	response, err := queries.Release(req)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to release lock",
			source,
			workflowID,
			version,
		)
	}

	data := map[string]any{
		"released": response.Released,
		"lock_key": response.LockKey,
		"message":  response.Message,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// AcquireSingle intenta adquirir un lock para sistema single-provider (sin provider_id)
func AcquireSingle(
	startTime string,
	lockDurationMinutes *int,
	ownerToken *string,
) types.StandardContractResponse[map[string]any] {
	source := "WF7_Distributed_Lock_System_Single"
	workflowID := "distributed-lock-acquire-single-v1"
	version := "1.0.0"

	// Validate start_time
	validation := utils.ValidateISODateTime(startTime, "start_time")
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Acquire lock (without provider_id)
	queries := NewDistributedLockQueries()
	req := types.AcquireLockRequest{
		StartTime:           startTime,
		LockDurationMinutes: lockDurationMinutes,
		OwnerToken:          ownerToken,
	}

	lock, acquired, err := queries.AcquireSingle(req)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeDBError,
			"Failed to acquire lock",
			source,
			workflowID,
			version,
		)
	}

	if !acquired {
		data := map[string]any{
			"acquired": false,
			"message":  "Lock is already held by another process",
		}

		if lock != nil {
			data["lock_key"] = lock.LockKey
			if !lock.ExpiresAt.IsZero() {
				retryAfter := time.Until(lock.ExpiresAt).Seconds()
				if retryAfter > 0 {
					data["retry_after"] = fmt.Sprintf("%.0f seconds", retryAfter)
				}
			}
		}

		return utils.SuccessResponse(data, source, workflowID, version)
	}

	data := map[string]any{
		"acquired":    true,
		"lock_id":     lock.LockID,
		"lock_key":    lock.LockKey,
		"owner_token": lock.OwnerToken,
		"expires_at":  lock.ExpiresAt.Format(time.RFC3339),
		"message":     "Lock acquired successfully",
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
