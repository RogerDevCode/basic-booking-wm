package db

import (
	"database/sql"
	"fmt"
	"time"
)

// GetProductionConfig returns optimized config for booking workload in production
func GetProductionConfig() DBConfig {
	return DBConfig{
		MaxOpenConns:    25,   // Increased for booking spikes
		MaxIdleConns:    10,   // Keep more connections ready
		ConnMaxLifetime: 10 * time.Minute, // Longer life for stability
		ConnMaxIdleTime: 5 * time.Minute,  // Recycle idle connections
	}
}

// GetHighConcurrencyConfig returns config for high-concurrency scenarios
func GetHighConcurrencyConfig() DBConfig {
	return DBConfig{
		MaxOpenConns:    50,   // High concurrency support
		MaxIdleConns:    25,   // Many idle connections ready
		ConnMaxLifetime: 15 * time.Minute, // Very stable connections
		ConnMaxIdleTime: 3 * time.Minute,  // Quick recycling
	}
}

// OptimizeConnectionPool applies production optimizations to existing DB connection
func OptimizeConnectionPool(db *sql.DB, config DBConfig) error {
	if db == nil {
		return fmt.Errorf("db.OptimizeConnectionPool: db is nil")
	}

	db.SetMaxOpenConns(config.MaxOpenConns)
	db.SetMaxIdleConns(config.MaxIdleConns)
	db.SetConnMaxLifetime(config.ConnMaxLifetime)
	db.SetConnMaxIdleTime(config.ConnMaxIdleTime)

	return nil
}

// GetPoolStats returns current connection pool statistics
func GetPoolStats(db *sql.DB) PoolStats {
	if db == nil {
		return PoolStats{}
	}

	stats := db.Stats()
	return PoolStats{
		MaxOpenConnections: stats.MaxOpenConnections,
		OpenConnections:    stats.OpenConnections,
		InUse:              stats.InUse,
		Idle:               stats.Idle,
		WaitCount:          stats.WaitCount,
		WaitDuration:       stats.WaitDuration,
		MaxIdleClosed:      stats.MaxIdleClosed,
		MaxIdleTimeClosed:  stats.MaxIdleTimeClosed,
	}
}

// PoolStats represents connection pool statistics
type PoolStats struct {
	MaxOpenConnections     int           // Maximum number of open connections ever
	OpenConnections        int           // Current number of open connections
	InUse                  int           // Current number of connections in use
	Idle                   int           // Current number of idle connections
	WaitCount              int64         // Total number of times waiting for connection
	WaitDuration           time.Duration // Total time waiting for connection
	MaxIdleClosed          int64         // Connections closed due to MaxIdleConns
	MaxIdleTimeClosed      int64         // Connections closed due to ConnMaxIdleTime
}

// IsHealthy checks if connection pool is healthy
func (s PoolStats) IsHealthy() bool {
	// Check if we're hitting connection limits
	if s.OpenConnections >= s.MaxOpenConnections && s.WaitCount > 0 {
		return false // Hitting max connections and waiting
	}

	// Check if wait duration is too high
	if s.WaitDuration > 5*time.Second {
		return false // Waiting too long for connections
	}

	return true
}

// GetHealthStatus returns health status of connection pool
func (s PoolStats) GetHealthStatus() string {
	if !s.IsHealthy() {
		if s.WaitCount > 0 {
			return fmt.Sprintf("UNHEALTHY: Waiting for connections (wait_count=%d, wait_duration=%v)",
				s.WaitCount, s.WaitDuration)
		}
		return "UNHEALTHY: Connection pool exhausted"
	}

	return fmt.Sprintf("HEALTHY: Open=%d, InUse=%d, Idle=%d, WaitCount=%d",
		s.OpenConnections, s.InUse, s.Idle, s.WaitCount)
}

// MonitorPool monitors connection pool and returns channel with stats
func MonitorPool(db *sql.DB, interval time.Duration) <-chan PoolStats {
	statsChan := make(chan PoolStats, 1)

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		defer close(statsChan)

		for range ticker.C {
			stats := GetPoolStats(db)
			select {
			case statsChan <- stats:
				// Sent successfully
			default:
				// Channel full, skip this update
			}
		}
	}()

	return statsChan
}

// AlertThresholds represents thresholds for connection pool alerts
type AlertThresholds struct {
	MaxWaitCount      int64         // Alert if wait count exceeds this
	MaxWaitDuration   time.Duration // Alert if wait duration exceeds this
	MinIdleConnections int          // Alert if idle connections below this
	MaxOpenPercent    float64       // Alert if open connections > this % of max
}

// DefaultAlertThresholds returns default alert thresholds
func DefaultAlertThresholds() AlertThresholds {
	return AlertThresholds{
		MaxWaitCount:      100,
		MaxWaitDuration:   5 * time.Second,
		MinIdleConnections: 2,
		MaxOpenPercent:    0.9, // 90% of max
	}
}

// CheckAlerts checks if connection pool stats exceed alert thresholds
func CheckAlerts(stats PoolStats, thresholds AlertThresholds) []Alert {
	var alerts []Alert

	if stats.WaitCount > thresholds.MaxWaitCount {
		alerts = append(alerts, Alert{
			Level:   "WARNING",
			Message: fmt.Sprintf("High wait count: %d (threshold: %d)", stats.WaitCount, thresholds.MaxWaitCount),
		})
	}

	if stats.WaitDuration > thresholds.MaxWaitDuration {
		alerts = append(alerts, Alert{
			Level:   "CRITICAL",
			Message: fmt.Sprintf("Long wait duration: %v (threshold: %v)", stats.WaitDuration, thresholds.MaxWaitDuration),
		})
	}

	if stats.Idle < thresholds.MinIdleConnections {
		alerts = append(alerts, Alert{
			Level:   "WARNING",
			Message: fmt.Sprintf("Low idle connections: %d (threshold: %d)", stats.Idle, thresholds.MinIdleConnections),
		})
	}

	if stats.MaxOpenConnections > 0 {
		openPercent := float64(stats.OpenConnections) / float64(stats.MaxOpenConnections)
		if openPercent > thresholds.MaxOpenPercent {
			alerts = append(alerts, Alert{
				Level:   "WARNING",
				Message: fmt.Sprintf("High connection usage: %.1f%% (threshold: %.0f%%)",
					openPercent*100, thresholds.MaxOpenPercent*100),
			})
		}
	}

	return alerts
}

// Alert represents a connection pool alert
type Alert struct {
	Level   string // "WARNING" or "CRITICAL"
	Message string
}
