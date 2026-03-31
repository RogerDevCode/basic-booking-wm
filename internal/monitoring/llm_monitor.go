// Real-time Monitoring for LLM Operations
// Based on: ZenML LLMOps, Anthropic monitoring patterns
// Tracks: costs, latency, errors, circuit breaker states

package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Metrics represents LLM operation metrics
type Metrics struct {
	mu sync.RWMutex
	
	// Request metrics
	TotalRequests   int64   `json:"total_requests"`
	SuccessfulReqs  int64   `json:"successful_requests"`
	FailedReqs      int64   `json:"failed_requests"`
	AvgLatencyMs    float64 `json:"avg_latency_ms"`
	P50LatencyMs    float64 `json:"p50_latency_ms"`
	P95LatencyMs    float64 `json:"p95_latency_ms"`
	P99LatencyMs    float64 `json:"p99_latency_ms"`
	
	// Cost metrics
	TotalTokensIn   int64   `json:"total_tokens_in"`
	TotalTokensOut  int64   `json:"total_tokens_out"`
	TotalCostUSD    float64 `json:"total_cost_usd"`
	CostPerRequest  float64 `json:"cost_per_request"`
	
	// Cache metrics
	CacheHits       int64   `json:"cache_hits"`
	CacheMisses     int64   `json:"cache_misses"`
	CacheHitRate    float64 `json:"cache_hit_rate"`
	
	// Error tracking
	ErrorsByType    map[string]int64 `json:"errors_by_type"`
	
	// Time tracking
	LastUpdated     time.Time `json:"last_updated"`
	StartTime       time.Time `json:"start_time"`
}

// LLMMonitor monitors LLM operations
type LLMMonitor struct {
	metrics      *Metrics
	redisClient  *redis.Client
	config       *MonitorConfig
	alerts       []Alert
	alertHandlers []func(Alert)
	mu           sync.RWMutex
}

// MonitorConfig configuration for monitor
type MonitorConfig struct {
	RedisAddr      string        `json:"redis_addr"`
	RedisPassword  string        `json:"redis_password"`
	EnableAlerts   bool          `json:"enable_alerts"`
	AlertThresholds AlertThresholds `json:"alert_thresholds"`
	PersistInterval time.Duration `json:"persist_interval"`
}

// AlertThresholds thresholds for triggering alerts
type AlertThresholds struct {
	MaxErrorRate      float64 `json:"max_error_rate"`       // 0.05 = 5%
	MaxLatencyP95     float64 `json:"max_latency_p95"`      // 10000ms
	MaxCostPerRequest float64 `json:"max_cost_per_request"` // 0.01 USD
	MinCacheHitRate   float64 `json:"min_cache_hit_rate"`   // 0.20 = 20%
	MaxConsecutiveErrors int64 `json:"max_consecutive_errors"`
}

// DefaultMonitorConfig returns production configuration
func DefaultMonitorConfig() *MonitorConfig {
	return &MonitorConfig{
		RedisAddr:      "localhost:6379",
		RedisPassword:  "",
		EnableAlerts:   true,
		PersistInterval: 1 * time.Minute,
		AlertThresholds: AlertThresholds{
			MaxErrorRate:      0.05,  // 5%
			MaxLatencyP95:     10000, // 10 seconds
			MaxCostPerRequest: 0.01,  // 1 cent
			MinCacheHitRate:   0.20,  // 20%
			MaxConsecutiveErrors: 10,
		},
	}
}

// Alert represents a monitoring alert
type Alert struct {
	Timestamp   time.Time `json:"timestamp"`
	Severity    string    `json:"severity"` // "warning", "critical"
	Type        string    `json:"type"`
	Message     string    `json:"message"`
	MetricValue float64   `json:"metric_value"`
	Threshold   float64   `json:"threshold"`
}

// NewLLMMonitor creates a new LLM monitor
func NewLLMMonitor(config *MonitorConfig) (*LLMMonitor, error) {
	if config == nil {
		config = DefaultMonitorConfig()
	}

	monitor := &LLMMonitor{
		metrics: &Metrics{
			StartTime:   time.Now(),
			LastUpdated: time.Now(),
			ErrorsByType: make(map[string]int64),
		},
		config: config,
		alerts: make([]Alert, 0),
	}

	// Initialize Redis if configured
	if config.RedisAddr != "" {
		monitor.redisClient = redis.NewClient(&redis.Options{
			Addr:     config.RedisAddr,
			Password: config.RedisPassword,
		})

		// Test connection
		if err := monitor.redisClient.Ping(context.Background()).Err(); err != nil {
			return nil, fmt.Errorf("failed to connect to Redis: %w", err)
		}

		// Start background persistence
		go monitor.persistMetrics()
	}

	return monitor, nil
}

// RecordRequest records a completed LLM request
func (m *LLMMonitor) RecordRequest(latencyMs int64, tokensIn, tokensOut int64, costUSD float64, cached bool, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.metrics.TotalRequests++
	m.metrics.LastUpdated = time.Now()

	if err != nil {
		m.metrics.FailedReqs++
		errorType := categorizeError(err)
		m.metrics.ErrorsByType[errorType]++
	} else {
		m.metrics.SuccessfulReqs++
	}

	// Update latency (simple moving average)
	m.updateLatency(latencyMs)

	// Update tokens and cost
	m.metrics.TotalTokensIn += tokensIn
	m.metrics.TotalTokensOut += tokensOut
	m.metrics.TotalCostUSD += costUSD
	
	if m.metrics.TotalRequests > 0 {
		m.metrics.CostPerRequest = m.metrics.TotalCostUSD / float64(m.metrics.TotalRequests)
	}

	// Update cache metrics
	if cached {
		m.metrics.CacheHits++
	} else {
		m.metrics.CacheMisses++
	}
	
	totalCache := m.metrics.CacheHits + m.metrics.CacheMisses
	if totalCache > 0 {
		m.metrics.CacheHitRate = float64(m.metrics.CacheHits) / float64(totalCache)
	}

	// Check alerts
	if m.config.EnableAlerts {
		m.checkAlerts()
	}
}

// GetMetrics returns current metrics
func (m *LLMMonitor) GetMetrics() *Metrics {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	// Return a copy
	metricsCopy := *m.metrics
	metricsCopy.ErrorsByType = make(map[string]int64)
	for k, v := range m.metrics.ErrorsByType {
		metricsCopy.ErrorsByType[k] = v
	}
	
	return &metricsCopy
}

// GetAlerts returns recent alerts
func (m *LLMMonitor) GetAlerts(limit int) []Alert {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	if limit > len(m.alerts) {
		limit = len(m.alerts)
	}
	
	result := make([]Alert, limit)
	copy(result, m.alerts[len(m.alerts)-limit:])
	
	return result
}

// AddAlertHandler adds a handler for alerts
func (m *LLMMonitor) AddAlertHandler(handler func(Alert)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.alertHandlers = append(m.alertHandlers, handler)
}

// Reset resets all metrics
func (m *LLMMonitor) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	m.metrics = &Metrics{
		StartTime:   time.Now(),
		LastUpdated: time.Now(),
		ErrorsByType: make(map[string]int64),
	}
}

// ============================================================================
// PRIVATE METHODS
// ============================================================================

func (m *LLMMonitor) updateLatency(latencyMs int64) {
	// Simple exponential moving average for avg latency
	alpha := 0.1
	if m.metrics.AvgLatencyMs == 0 {
		m.metrics.AvgLatencyMs = float64(latencyMs)
	} else {
		m.metrics.AvgLatencyMs = (1-alpha)*m.metrics.AvgLatencyMs + alpha*float64(latencyMs)
	}
	
	// For p50, p95, p99: in production use proper percentile calculation
	// This is a simplified version
	if latencyMs > m.metrics.P99LatencyMs {
		m.metrics.P99LatencyMs = float64(latencyMs)
	}
	if latencyMs > m.metrics.P95LatencyMs {
		m.metrics.P95LatencyMs = float64(latencyMs) * 0.95
	}
	if latencyMs > m.metrics.P50LatencyMs {
		m.metrics.P50LatencyMs = float64(latencyMs) * 0.90
	}
}

func (m *LLMMonitor) checkAlerts() {
	totalReqs := m.metrics.TotalRequests
	if totalReqs == 0 {
		return
	}

	errorRate := float64(m.metrics.FailedReqs) / float64(totalReqs)
	
	// Check error rate
	if errorRate > m.config.AlertThresholds.MaxErrorRate {
		m.triggerAlert("critical", "high_error_rate",
			fmt.Sprintf("Error rate %.2f%% exceeds threshold %.2f%%",
				errorRate*100, m.config.AlertThresholds.MaxErrorRate*100),
			errorRate, m.config.AlertThresholds.MaxErrorRate)
	}

	// Check latency
	if m.metrics.P95LatencyMs > m.config.AlertThresholds.MaxLatencyP95 {
		m.triggerAlert("warning", "high_latency",
			fmt.Sprintf("P95 latency %.0fms exceeds threshold %.0fms",
				m.metrics.P95LatencyMs, m.config.AlertThresholds.MaxLatencyP95),
			m.metrics.P95LatencyMs, m.config.AlertThresholds.MaxLatencyP95)
	}

	// Check cost
	if m.metrics.CostPerRequest > m.config.AlertThresholds.MaxCostPerRequest {
		m.triggerAlert("warning", "high_cost",
			fmt.Sprintf("Cost per request $%.4f exceeds threshold $%.4f",
				m.metrics.CostPerRequest, m.config.AlertThresholds.MaxCostPerRequest),
			m.metrics.CostPerRequest, m.config.AlertThresholds.MaxCostPerRequest)
	}

	// Check cache hit rate
	if m.metrics.CacheHitRate > 0 && m.metrics.CacheHitRate < m.config.AlertThresholds.MinCacheHitRate {
		m.triggerAlert("warning", "low_cache_hit_rate",
			fmt.Sprintf("Cache hit rate %.2f%% below threshold %.2f%%",
				m.metrics.CacheHitRate*100, m.config.AlertThresholds.MinCacheHitRate*100),
			m.metrics.CacheHitRate, m.config.AlertThresholds.MinCacheHitRate)
	}
}

func (m *LLMMonitor) triggerAlert(severity, alertType, message string, value, threshold float64) {
	alert := Alert{
		Timestamp:   time.Now(),
		Severity:    severity,
		Type:        alertType,
		Message:     message,
		MetricValue: value,
		Threshold:   threshold,
	}

	m.alerts = append(m.alerts, alert)
	
	// Limit alerts to last 100
	if len(m.alerts) > 100 {
		m.alerts = m.alerts[len(m.alerts)-100:]
	}

	// Notify handlers
	for _, handler := range m.alertHandlers {
		go handler(alert)
	}

	// Log alert
	fmt.Printf("🚨 ALERT [%s] %s: %s\n", severity, alertType, message)
}

func (m *LLMMonitor) persistMetrics() {
	ticker := time.NewTicker(m.config.PersistInterval)
	defer ticker.Stop()

	for range ticker.C {
		m.mu.RLock()
		metricsJSON, _ := json.Marshal(m.metrics)
		m.mu.RUnlock()

		if m.redisClient != nil {
			m.redisClient.Set(context.Background(), "llm:metrics", string(metricsJSON), 24*time.Hour)
		}
	}
}

func categorizeError(err error) string {
	errStr := err.Error()
	
	if contains(errStr, "timeout") || contains(errStr, "deadline") {
		return "timeout"
	}
	if contains(errStr, "429") || contains(errStr, "rate limit") {
		return "rate_limit"
	}
	if contains(errStr, "401") || contains(errStr, "authentication") {
		return "authentication"
	}
	if contains(errStr, "500") || contains(errStr, "502") || contains(errStr, "503") {
		return "server_error"
	}
	if contains(errStr, "400") || contains(errStr, "invalid") {
		return "client_error"
	}
	
	return "unknown"
}

func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
