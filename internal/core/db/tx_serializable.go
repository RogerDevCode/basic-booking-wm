package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/lib/pq"
)

// TxOptions represents transaction configuration
type TxOptions struct {
	IsolationLevel sql.IsolationLevel
	ReadOnly       bool
	MaxRetries     int
}

// DefaultTxOptions returns default transaction options
func DefaultTxOptions() TxOptions {
	return TxOptions{
		IsolationLevel: sql.LevelDefault,
		ReadOnly:       false,
		MaxRetries:     3,
	}
}

// SerializableTxOptions returns options for SERIALIZABLE isolation
func SerializableTxOptions() TxOptions {
	return TxOptions{
		IsolationLevel: sql.LevelSerializable,
		ReadOnly:       false,
		MaxRetries:     3,
	}
}

// BeginTxWithOptions starts a transaction with custom options
func BeginTxWithOptions(ctx context.Context, db *sql.DB, opts TxOptions) (*sql.Tx, error) {
	sqlOpts := &sql.TxOptions{
		Isolation: opts.IsolationLevel,
		ReadOnly:  opts.ReadOnly,
	}

	tx, err := db.BeginTx(ctx, sqlOpts)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	return tx, nil
}

// WithSerializableRetry executes a function in a SERIALIZABLE transaction with retry logic
// This is the recommended pattern for booking operations that require strong consistency
func WithSerializableRetry(
	ctx context.Context,
	db *sql.DB,
	fn func(*sql.Tx) error,
) error {
	return WithTxRetry(ctx, db, SerializableTxOptions(), fn)
}

// WithTxRetry executes a function in a transaction with retry logic for serialization failures
func WithTxRetry(
	ctx context.Context,
	db *sql.DB,
	opts TxOptions,
	fn func(*sql.Tx) error,
) error {
	var lastErr error
	maxRetries := opts.MaxRetries
	if maxRetries < 1 {
		maxRetries = 3
	}

	for attempt := 0; attempt < maxRetries; attempt++ {
		// Begin transaction
		tx, err := BeginTxWithOptions(ctx, db, opts)
		if err != nil {
			return fmt.Errorf("db.WithTxRetry: begin failed: %w", err)
		}

		// Execute function
		err = fn(tx)
		if err == nil {
			// Success - commit
			if commitErr := tx.Commit(); commitErr != nil {
				return fmt.Errorf("db.WithTxRetry: commit failed: %w", commitErr)
			}
			return nil
		}

		// Error occurred - rollback
		tx.Rollback()

		// Check if retryable error
		if !isRetryableError(err) {
			// Non-retryable error - return immediately
			return err
		}

		// Retryable error - store and retry
		lastErr = err

		// Exponential backoff: 100ms, 200ms, 400ms
		backoff := time.Duration(100*(1<<uint(attempt))) * time.Millisecond
		select {
		case <-time.After(backoff):
			// Continue to next attempt
		case <-ctx.Done():
			return fmt.Errorf("db.WithTxRetry: context cancelled after %d retries: %w", attempt, lastErr)
		}
	}

	return fmt.Errorf("db.WithTxRetry: failed after %d retries: %w", maxRetries, lastErr)
}

// isRetryableError checks if an error is retryable
func isRetryableError(err error) bool {
	if err == nil {
		return false
	}

	// Check for PostgreSQL-specific retryable errors
	if pqErr, ok := err.(*pq.Error); ok {
		switch pqErr.Code {
		case "40001": // serialization_failure
			return true
		case "40P01": // deadlock_detected
			return true
		case "55P03": // lock_not_available
			return true
		case "57014": // query_canceled
			return true
		case "08000": // connection_exception
			return true
		case "08003": // connection_does_not_exist
			return true
		case "08006": // connection_failure
			return true
		}
	}

	// Check for generic retryable errors
	errStr := err.Error()
	if containsString(errStr, "serialization") ||
		containsString(errStr, "deadlock") ||
		containsString(errStr, "lock") {
		return true
	}

	return false
}

// containsString checks if a string contains a substring
func containsString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// IsSerializationFailure checks if an error is a serialization failure
func IsSerializationFailure(err error) bool {
	if pqErr, ok := err.(*pq.Error); ok {
		return pqErr.Code == "40001" // serialization_failure
	}
	return false
}

// IsDeadlockFailure checks if an error is a deadlock failure
func IsDeadlockFailure(err error) bool {
	if pqErr, ok := err.(*pq.Error); ok {
		return pqErr.Code == "40P01" // deadlock_detected
	}
	return false
}

// GetPostgreSQLErrorCode extracts the PostgreSQL error code from an error
func GetPostgreSQLErrorCode(err error) string {
	if pqErr, ok := err.(*pq.Error); ok {
		return string(pqErr.Code)
	}
	return ""
}

// GetPostgreSQLErrorDetail extracts the PostgreSQL error detail from an error
func GetPostgreSQLErrorDetail(err error) string {
	if pqErr, ok := err.(*pq.Error); ok {
		return pqErr.Detail
	}
	return ""
}
