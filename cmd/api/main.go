package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"booking-titanium-wm/internal/booking"
	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/internal/infrastructure"
	"booking-titanium-wm/internal/rag"
	"booking-titanium-wm/pkg/logging"
	"booking-titanium-wm/pkg/types"
)

// ============================================================================
// LOGGER (HIPAA-COMPLIANT)
// ============================================================================

var log *logging.Logger

func init() {
	// Initialize HIPAA-compliant logger
	logging.InitLogger("booking-titanium-api", "info")
	log = logging.GetDefaultLogger()
}

// ============================================================================
// CONFIGURATION
// ============================================================================

type Config struct {
	ServerHost    string
	ServerPort    string
	DatabaseURL   string
	ServerTimeout time.Duration
	ReadTimeout   time.Duration
	WriteTimeout  time.Duration
	IdleTimeout   time.Duration
}

func LoadConfig() *Config {
	return &Config{
		ServerHost:    getEnv("SERVER_HOST", "0.0.0.0"),
		ServerPort:    getEnv("SERVER_PORT", "8080"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgresql://localhost:5432/bookings?sslmode=disable"),
		ServerTimeout: getEnvDuration("SERVER_TIMEOUT", 30*time.Second),
		ReadTimeout:   getEnvDuration("READ_TIMEOUT", 15*time.Second),
		WriteTimeout:  getEnvDuration("WRITE_TIMEOUT", 15*time.Second),
		IdleTimeout:   getEnvDuration("IDLE_TIMEOUT", 60*time.Second),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

// APIRequest representa una solicitud a la API Gateway (v5.0 - UUID support)
type APIRequest struct {
	Action             string `json:"action"`
	ProviderID         string `json:"provider_id,omitempty"`
	ServiceID          string `json:"service_id,omitempty"`
	StartTime          string `json:"start_time,omitempty"`
	ChatID             string `json:"chat_id,omitempty"`
	UserName           string `json:"user_name,omitempty"`
	UserEmail          string `json:"user_email,omitempty"`
	BookingID          string `json:"booking_id,omitempty"`
	CancellationReason string `json:"cancellation_reason,omitempty"`
	NewStartTime       string `json:"new_start_time,omitempty"`
	Date               string `json:"date,omitempty"`
	Limit              int    `json:"limit,omitempty"`
}

// ============================================================================
// MAIN
// ============================================================================

func main() {
	log.Info("Starting Booking Titanium API Gateway")

	// Load configuration
	config := LoadConfig()
	log.Info("Configuration loaded: host=%s, port=%s", config.ServerHost, config.ServerPort)

	// Initialize database
	dbConfig := db.DBConfig{
		ConnectionString: config.DatabaseURL,
		MaxOpenConns:     10,
		MaxIdleConns:     10,
		ConnMaxLifetime:  30 * time.Minute,
		ConnMaxIdleTime:  10 * time.Minute,
	}

	if err := db.InitDB(dbConfig); err != nil {
		log.Error("Failed to initialize database: %v", err)
		os.Exit(1)
	}
	defer db.CloseDB()
	log.Info("Database connection established")

	// Create HTTP server mux
	mux := http.NewServeMux()

	// Register routes
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/book-appointment", bookingGatewayHandler)
	mux.HandleFunc("/book-appointment/circuit-breaker/check", circuitBreakerCheckHandler)
	mux.HandleFunc("/book-appointment/circuit-breaker/record", circuitBreakerRecordHandler)
	mux.HandleFunc("/book-appointment/dlq/add", dlqAddHandler)
	mux.HandleFunc("/book-appointment/dlq/status", dlqStatusHandler)
	mux.HandleFunc("/book-appointment/gcal-delete-event", gcalDeleteEventHandler)
	mux.HandleFunc("/book-appointment/gmail-send-confirmation", gmailSendConfirmationHandler)
	mux.HandleFunc("/book-appointment/db-get-providers", dbGetProvidersHandler)
	mux.HandleFunc("/book-appointment/rag-ingest-document", ragIngestHandler)
	mux.HandleFunc("/book-appointment/rag-search", ragSearchHandler)
	mux.HandleFunc("/api/v1/bookings/", bookingsHandler)
	mux.HandleFunc("/api/telegram/webhook", telegramWebhookHandler)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf("%s:%s", config.ServerHost, config.ServerPort),
		Handler:      loggingMiddleware(mux),
		ReadTimeout:  config.ReadTimeout,
		WriteTimeout: config.WriteTimeout,
		IdleTimeout:  config.IdleTimeout,
	}

	// Start server in goroutine
	go func() {
		log.Info("Starting HTTP server on %s:%s", config.ServerHost, config.ServerPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Error("Server forced to shutdown: %v", err)
	}

	log.Info("Server stopped")
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

// loggingMiddleware logs all HTTP requests (HIPAA-compliant)
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Call next handler
		next.ServeHTTP(w, r)

		// Log request (HIPAA-compliant: no PII)
		log.Info("HTTP %s %s from %s completed in %v",
			r.Method,
			r.URL.Path,
			r.RemoteAddr,
			time.Since(start),
		)
	})
}

// corsMiddleware adds CORS headers
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ============================================================================
// HANDLERS
// ============================================================================

// healthHandler handles health check requests
func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	response := map[string]any{
		"status":    "healthy",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"version":   "1.0.0",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// bookingGatewayHandler handles all booking-related requests
func bookingGatewayHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request body
	var req APIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_JSON", "Failed to parse request body")
		return
	}

	// Route by action
	var response types.StandardContractResponse[map[string]any]

	switch req.Action {
	case "get_config":
		response = handleGetConfig(req)
	case "create_booking":
		response = handleCreateBooking(req)
	case "cancel_booking":
		response = handleCancelBooking(req)
	case "reschedule_booking":
		response = handleRescheduleBooking(req)
	case "check_availability":
		response = handleCheckAvailability(req)
	case "get_service_info":
		response = handleGetServiceInfo()
	case "get_my_bookings":
		response = handleGetMyBookings(req)
	// DEPRECATED ENDPOINTS (return 410 Gone)
	// These endpoints are deprecated in single-provider system
	case "get_providers", "get_services":
		response = types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorCode:    ptr("ENDPOINT_DEPRECATED"),
			ErrorMessage: ptr(fmt.Sprintf("The %s endpoint is deprecated in single-provider system. Use /service-info instead.", req.Action)),
			Data:         nil,
			Meta: types.ResponseMetadata{
				Source:    "API_Gateway_Deprecated",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Version:   "5.0.0",
			},
		}
	default:
		response = types.StandardContractResponse[map[string]any]{
			Success:      false,
			ErrorCode:    ptr("INVALID_ACTION"),
			ErrorMessage: ptr(fmt.Sprintf("Unknown action: %s", req.Action)),
			Data:         nil,
			Meta: types.ResponseMetadata{
				Source:    "API_Gateway",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Version:   "1.0.0",
			},
		}
	}

	// Write response
	statusCode := http.StatusOK
	if !response.Success {
		statusCode = http.StatusBadRequest
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}

// bookingsHandler handles /api/v1/bookings/* requests
func bookingsHandler(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement RESTful bookings API
	http.Error(w, "Not implemented", http.StatusNotImplemented)
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

func handleGetConfig(req APIRequest) types.StandardContractResponse[map[string]any] {
	data := config.GetBookingConfig()

	return types.StandardContractResponse[map[string]any]{
		Success: true,
		Data:    &data,
		Meta: types.ResponseMetadata{
			Source:    "BB_00_Config",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Version:   "1.0.0",
		},
	}
}

// handleGetServiceInfo returns info about the single service (v5.0)
func handleGetServiceInfo() types.StandardContractResponse[map[string]any] {
	cfg := config.GetSystemConfig()
	
	data := map[string]any{
		"provider_id":       cfg.ProviderID,
		"service_id":        cfg.ServiceID,
		"service_duration":  cfg.ServiceDurationMin,
		"buffer_minutes":    cfg.ServiceBufferMin,
		"max_advance_days":  cfg.BookingMaxAdvanceDays,
		"min_advance_hours": cfg.BookingMinAdvanceHours,
	}

	return types.StandardContractResponse[map[string]any]{
		Success: true,
		Data:    &data,
		Meta: types.ResponseMetadata{
			Source:    "API_Service_Info",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Version:   "5.0.0",
		},
	}
}

func handleCreateBooking(req APIRequest) types.StandardContractResponse[map[string]any] {
	// v5.0 - Always use Orchestrator for full workflow coverage (locks, GCal, etc.)
	return orchestrator.BookingOrchestrator(orchestrator.BookingOrchestratorRequest{
		StartTime: req.StartTime,
		ChatID:    req.ChatID,
		UserName:  req.UserName,
		UserEmail: req.UserEmail,
	})
}

func handleCancelBooking(req APIRequest) types.StandardContractResponse[map[string]any] {
	return booking.CancelBooking(req.BookingID, &req.CancellationReason)
}

func handleRescheduleBooking(req APIRequest) types.StandardContractResponse[map[string]any] {
	return booking.RescheduleBooking(req.BookingID, req.NewStartTime)
}

func handleCheckAvailability(req APIRequest) types.StandardContractResponse[map[string]any] {
	// v5.0 - Use single provider config
	cfg := config.GetSystemConfig()
	return availability.CheckAvailability(cfg.ProviderID, cfg.ServiceID, req.Date)
}

func handleFindNextAvailable(req APIRequest) types.StandardContractResponse[map[string]any] {
	// TODO: Implement find next available
	return types.StandardContractResponse[map[string]any]{
		Success:      false,
		ErrorCode:    ptr("NOT_IMPLEMENTED"),
		ErrorMessage: ptr("find_next_available not yet implemented"),
		Data:         nil,
		Meta: types.ResponseMetadata{
			Source:    "API_Gateway",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Version:   "1.0.0",
		},
	}
}

func handleGetProviders(req APIRequest) types.StandardContractResponse[map[string]any] {
	// TODO: Implement get providers
	return types.StandardContractResponse[map[string]any]{
		Success:      false,
		ErrorCode:    ptr("NOT_IMPLEMENTED"),
		ErrorMessage: ptr("get_providers not yet implemented"),
		Data:         nil,
		Meta: types.ResponseMetadata{
			Source:    "API_Gateway",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Version:   "1.0.0",
		},
	}
}

func handleGetServices(req APIRequest) types.StandardContractResponse[map[string]any] {
	// TODO: Implement get services
	return types.StandardContractResponse[map[string]any]{
		Success:      false,
		ErrorCode:    ptr("NOT_IMPLEMENTED"),
		ErrorMessage: ptr("get_services not yet implemented"),
		Data:         nil,
		Meta: types.ResponseMetadata{
			Source:    "API_Gateway",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Version:   "1.0.0",
		},
	}
}

func handleGetMyBookings(req APIRequest) types.StandardContractResponse[map[string]any] {
	// v5.0 - Use booking package with ChatID support
	limit := req.Limit
	if limit <= 0 {
		limit = 10
	}
	return booking.GetBookingsByChatID(req.ChatID, limit)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

func writeErrorResponse(w http.ResponseWriter, statusCode int, errorCode string, errorMessage string) {
	response := types.StandardContractResponse[map[string]any]{
		Success:      false,
		ErrorCode:    &errorCode,
		ErrorMessage: &errorMessage,
		Data:         nil,
		Meta: types.ResponseMetadata{
			Source:    "API_Gateway",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Version:   "1.0.0",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}

// circuitBreakerCheckHandler handles GET/POST /book-appointment/circuit-breaker/check
func circuitBreakerCheckHandler(w http.ResponseWriter, r *http.Request) {
	var serviceID string
	if r.Method == http.MethodPost {
		var body struct {
			ServiceID string `json:"service_id"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		serviceID = body.ServiceID
	} else {
		serviceID = r.URL.Query().Get("service_id")
	}

	response := infrastructure.Check(serviceID)
	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

// circuitBreakerRecordHandler handles POST /book-appointment/circuit-breaker/record
func circuitBreakerRecordHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		ServiceID    string `json:"service_id"`
		Success      bool   `json:"success"`
		ErrorMessage string `json:"error_message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_JSON", "Failed to parse request body")
		return
	}

	var response types.StandardContractResponse[map[string]any]
	if body.Success {
		response = infrastructure.RecordSuccess(body.ServiceID)
	} else {
		response = infrastructure.RecordFailure(body.ServiceID, body.ErrorMessage)
	}

	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

// dlqAddHandler handles POST /book-appointment/dlq/add
func dlqAddHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req types.DLQAddRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_JSON", "Failed to parse request body")
		return
	}

	response := infrastructure.DLQAdd(req)
	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

// dlqStatusHandler handles GET /book-appointment/dlq/status
func dlqStatusHandler(w http.ResponseWriter, r *http.Request) {
	response := infrastructure.DLQGetStatus()
	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

func gcalDeleteEventHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		EventID string `json:"gcal_event_id"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	response := infrastructure.GCalDeleteEvent(body.EventID)
	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

func gmailSendConfirmationHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		UserEmail string `json:"user_email"`
		UserName  string `json:"user_name"`
		StartTime string `json:"start_time"`
		// Tests also use these fields
		Email           string `json:"email"`
		FinalEmail      string `json:"final_email"`
		CustomerName    string `json:"customer_name"`
		AppointmentTime string `json:"appointment_time"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	// Fallback to other fields if primary ones are missing
	email := body.UserEmail
	if email == "" {
		email = body.FinalEmail
	}
	if email == "" {
		email = body.Email
	}

	name := body.UserName
	if name == "" {
		name = body.CustomerName
	}

	startTime := body.StartTime
	if startTime == "" {
		startTime = body.AppointmentTime
	}

	response := infrastructure.GMailSendConfirmation(email, name, startTime)
	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

func dbGetProvidersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Active interface{} `json:"active"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	response := booking.GetProviders(body.Active)
	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

func ragIngestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_JSON", "Failed to parse request body")
		return
	}

	response := rag.HandleIngest(payload)
	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

func ragSearchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_JSON", "Failed to parse request body")
		return
	}

	response := rag.HandleSearch(payload)
	w.Header().Set("Content-Type", "application/json")
	if !response.Success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(response)
}

// ============================================================================
// TELEGRAM WEBHOOK HANDLER
// ============================================================================

// telegramWebhookHandler handles POST /api/telegram/webhook
// Receives Telegram webhook updates and processes them
func telegramWebhookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse Telegram webhook payload
	var telegramUpdate map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&telegramUpdate); err != nil {
		log.Error("Telegram webhook failed to parse payload: %v", err)
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_JSON", "Failed to parse Telegram payload")
		return
	}

	// Extract message (could be regular message or channel post)
	message, hasMessage := telegramUpdate["message"].(map[string]interface{})
	if !hasMessage {
		channelPost, hasChannelPost := telegramUpdate["channel_post"].(map[string]interface{})
		if !hasChannelPost {
			log.Warn("Telegram webhook received message without message or channel_post")
			writeErrorResponse(w, http.StatusBadRequest, "INVALID_MESSAGE", "No valid message found")
			return
		}
		message = channelPost
	}

	// Extract chat and text
	chat, hasChat := message["chat"].(map[string]interface{})
	if !hasChat {
		log.Warn("Telegram webhook message missing chat field")
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_MESSAGE", "No chat found")
		return
	}

	chatIDFloat, ok := chat["id"].(float64)
	if !ok {
		log.Error("Telegram webhook has invalid chat_id type")
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_CHAT_ID", "Invalid chat_id")
		return
	}
	chatID := int64(chatIDFloat)

	text, _ := message["text"].(string)

	// HIPAA-COMPLIANT LOG: Only log chat_id (integer), NEVER log message content
	log.Info("Telegram webhook received from chat_id=%d", chatID)

	// === HERE YOU CAN CALL WINDMILL FLOW ===
	// Option 1: Call Windmill API to execute the telegram-webhook flow
	// Option 2: Process locally using internal packages (message/parser + ai/agent)
	
	// For now, return success acknowledgment
	// Telegram expects a 200 OK response within 3 seconds
	response := map[string]any{
		"success": true,
		"message": "Webhook received",
		"chat_id": chatID,
		"text":    text,
		"status":  "processing",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func ptr[T any](v T) *T {
	return &v
}
