package communication

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// TelegramConfig holds Telegram bot configuration
type TelegramConfig struct {
	BotToken string
	APIURL   string
}

// resolveTelegramCredentials multiplexes between local env vars (dev) and Windmill variables (prod)
func resolveTelegramCredentials() (*TelegramConfig, error) {
	// 1. Try local development mode
	localToken := os.Getenv("DEV_LOCAL_TELEGRAM_TOKEN")
	if localToken != "" {
		// Use local environment variable
		apiURL := getEnv("TELEGRAM_API_URL", "https://api.telegram.org")
		return &TelegramConfig{
			BotToken: localToken,
			APIURL:   apiURL,
		}, nil
	}

	// 2. Production mode - use standard env var (set by Windmill)
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("Telegram credentials not configured: TELEGRAM_BOT_TOKEN not set")
	}

	apiURL := getEnv("TELEGRAM_API_URL", "https://api.telegram.org")
	return &TelegramConfig{
		BotToken: token,
		APIURL:   apiURL,
	}, nil
}

// GetTelegramConfig returns the Telegram configuration from environment or local dev vars
func GetTelegramConfig() (*TelegramConfig, error) {
	return resolveTelegramCredentials()
}

// SendMessageRequest represents a request to send a Telegram message
type SendMessageRequest struct {
	ChatID    string `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode,omitempty"` // MarkdownV2, HTML, or empty
}

// telegramResponse represents a Telegram API response
type telegramResponse struct {
	OK          bool            `json:"ok"`
	Result      json.RawMessage `json:"result,omitempty"`
	ErrorCode   int             `json:"error_code,omitempty"`
	Description string          `json:"description,omitempty"`
}

// telegramMessage represents a Telegram message result
type telegramMessage struct {
	MessageID int `json:"message_id"`
	Chat      struct {
		ID int64 `json:"id"`
	} `json:"chat"`
}

// SendMessage envía un mensaje a Telegram
func SendMessage(
	chatID string,
	text string,
	parseMode string,
) types.StandardContractResponse[map[string]any] {
	source := "NN_04_Telegram_Sender"
	workflowID := "telegram-send-v1"
	version := "1.0.0"

	// Validate chat_id
	validation := utils.ValidateChatID(chatID)
	if !validation.Valid {
		return utils.ErrorResponse[map[string]any](
			validation.Error,
			validation.Message,
			source,
			workflowID,
			version,
		)
	}

	// Validate text
	if text == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"text is required",
			source,
			workflowID,
			version,
		)
	}

	// Sanitize text for Telegram MarkdownV2
	if parseMode == "MarkdownV2" {
		text = sanitizeForMarkdownV2(text)
	}

	// Get config
	config, err := GetTelegramConfig()
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeTelegramError,
			fmt.Sprintf("Telegram configuration error: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Validate bot token
	if config.BotToken == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeTelegramError,
			"Telegram bot token not configured",
			source,
			workflowID,
			version,
		)
	}

	// Build API URL
	apiURL := fmt.Sprintf(
		"%s/bot%s/sendMessage",
		config.APIURL,
		config.BotToken,
	)

	// Build request
	formData := url.Values{}
	formData.Set("chat_id", chatID)
	formData.Set("text", text)
	if parseMode != "" {
		formData.Set("parse_mode", parseMode)
	}

	// Send request
	resp, err := http.PostForm(apiURL, formData)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeTelegramError,
			fmt.Sprintf("Failed to send Telegram message: %v", err),
			source,
			workflowID,
			version,
		)
	}
	defer resp.Body.Close()

	// Parse response
	var teleResp telegramResponse
	if err := json.NewDecoder(resp.Body).Decode(&teleResp); err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeTelegramError,
			fmt.Sprintf("Failed to parse Telegram response: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Check if request was successful
	if !teleResp.OK {
		errorCode, errorMessage := classifyTelegramError(
			teleResp.ErrorCode,
			teleResp.Description,
		)

		return utils.ErrorResponse[map[string]any](
			errorCode,
			errorMessage,
			source,
			workflowID,
			version,
		)
	}

	// Parse message result
	var messageResult telegramMessage
	if err := json.Unmarshal(teleResp.Result, &messageResult); err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeTelegramError,
			fmt.Sprintf("Failed to parse message result: %v", err),
			source,
			workflowID,
			version,
		)
	}

	data := map[string]any{
		"message_id":      messageResult.MessageID,
		"chat_id":         chatID,
		"delivery_status": "SENT",
		"text_length":     len(text),
		"sent_at":         time.Now().UTC().Format(time.RFC3339),
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// sanitizeForMarkdownV2 escapes special characters for Telegram MarkdownV2
func sanitizeForMarkdownV2(text string) string {
	// Characters to escape in MarkdownV2
	specialChars := []string{"_", "*", "[", "]", "(", ")", "~", "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!"}

	escaped := text
	for _, char := range specialChars {
		escaped = strings.ReplaceAll(escaped, char, "\\"+char)
	}

	return escaped
}

// classifyTelegramError classifies Telegram API errors
func classifyTelegramError(errorCode int, description string) (string, string) {
	switch {
	case errorCode == 400:
		if strings.Contains(description, "chat not found") {
			return types.ErrorCodeTelegramError, "Telegram chat not found or bot blocked"
		}
		if strings.Contains(description, "message text is empty") {
			return types.ErrorCodeInvalidInput, "Message text cannot be empty"
		}
		return types.ErrorCodeTelegramError, fmt.Sprintf("Telegram Bad Request: %s", description)

	case errorCode == 401:
		return types.ErrorCodeTelegramError, "Telegram bot token invalid or unauthorized"

	case errorCode == 403:
		if strings.Contains(description, "bot was blocked") {
			return types.ErrorCodeTelegramError, "Bot was blocked by user"
		}
		return types.ErrorCodeTelegramError, "Bot cannot send messages to this user"

	case errorCode == 429:
		return types.ErrorCodeTelegramError, "Telegram rate limit exceeded - too many requests"

	default:
		return types.ErrorCodeTelegramError, fmt.Sprintf("Telegram API error (%d): %s", errorCode, description)
	}
}

// SendTelegramBookingConfirmation envía una confirmación de reserva
func SendTelegramBookingConfirmation(
	chatID string,
	bookingID string,
	providerName string,
	serviceName string,
	startTime string,
) types.StandardContractResponse[map[string]any] {
	// Format message
	text := fmt.Sprintf(
		"✅ *Reserva Confirmada*\n\n"+
			"📋 *Detalles:*\n"+
			"ID de Reserva: `%s`\n"+
			"Proveedor: %s\n"+
			"Servicio: %s\n"+
			"Fecha: %s\n\n"+
			"Gracias por confiar en nosotros! 🎉",
		bookingID,
		providerName,
		serviceName,
		startTime,
	)

	// Send message
	return SendMessage(chatID, text, "MarkdownV2")
}

// SendTelegramBookingCancellation envía una cancelación de reserva
func SendTelegramBookingCancellation(
	chatID string,
	bookingID string,
	reason string,
) types.StandardContractResponse[map[string]any] {
	// Format message
	text := fmt.Sprintf(
		"❌ *Reserva Cancelada*\n\n"+
			"📋 *Detalles:*\n"+
			"ID de Reserva: `%s`\n"+
			"Motivo: %s\n\n"+
			"Si tienes alguna consulta, no dudes en contactarnos.",
		bookingID,
		reason,
	)

	// Send message
	return SendMessage(chatID, text, "MarkdownV2")
}

// SendReminder envía un recordatorio de reserva
func SendReminder(
	chatID string,
	bookingID string,
	serviceName string,
	startTime string,
	hoursBefore int,
) types.StandardContractResponse[map[string]any] {
	source := "NN_05_Reminder_Cron"
	workflowID := "reminder-cron-v1"
	version := "1.0.0"

	// Format message
	text := fmt.Sprintf(
		"⏰ *Recordatorio de Reserva*\n\n"+
			"📋 *Detalles:*\n"+
			"ID de Reserva: `%s`\n"+
			"Servicio: %s\n"+
			"Fecha: %s\n\n"+
			"Tu reserva es en *%d horas*. Te esperamos! 👋",
		bookingID,
		serviceName,
		startTime,
		hoursBefore,
	)

	// Send message
	resp := SendMessage(chatID, text, "MarkdownV2")

	// Override meta for reminder context
	resp.Meta.Source = source
	resp.Meta.WorkflowID = workflowID
	resp.Meta.Version = version

	return resp
}

// ============================================================================
// RETRY PROTOCOL (v4.0 LAW-15)
// ============================================================================

const (
	TelegramMaxRetries      = 3
	TelegramBaseBackoffSec  = 1 // Backoff: 1s, 3s, 9s (3^attempt)
	TelegramTimeoutSeconds  = 30
)

// SendMessageWithRetry sends a Telegram message with exponential backoff retry
func SendMessageWithRetry(
	chatID string,
	text string,
	parseMode string,
) types.StandardContractResponse[map[string]any] {

	var lastResp types.StandardContractResponse[map[string]any]

	for attempt := 0; attempt < TelegramMaxRetries; attempt++ {
		resp := SendMessage(chatID, text, parseMode)
		
		if resp.Success {
			return resp
		}

		lastResp = resp

		// Check if error is permanent (4xx) or transient (5xx, timeout, network)
		if isPermanentTelegramError(resp) {
			// Permanent error: don't retry
			return resp
		}

		// Transient error: retry with backoff
		if attempt < TelegramMaxRetries-1 {
			backoff := time.Duration(math.Pow(3, float64(attempt))) * time.Second
			time.Sleep(backoff) // 1s, 3s, 9s
		}
	}

	// All retries failed
	return lastResp
}

// isPermanentTelegramError checks if an error is permanent (should not retry)
func isPermanentTelegramError(resp types.StandardContractResponse[map[string]any]) bool {
	if resp.ErrorCode == nil {
		return false // Assume transient if no error code
	}

	// Error code is a string in StandardContractResponse
	errCodeStr := *resp.ErrorCode

	// Permanent errors (4xx range, except 429)
	permanentCodes := map[string]bool{
		"400": true, // Bad Request
		"401": true, // Unauthorized (bot token invalid)
		"403": true, // Forbidden (bot blocked by user)
		"404": true, // Not Found
		"409": true, // Conflict
	}

	// 429 Too Many Requests is transient (should retry with retry-after)
	if errCodeStr == "429" {
		return false
	}

	return permanentCodes[errCodeStr]
}

// SendReminderWithRetry sends a reminder message with retry (v4.0 §8.4)
func SendReminderWithRetry(
	chatID string,
	bookingID string,
	serviceName string,
	startTime string,
	hoursBefore int,
) types.StandardContractResponse[map[string]any] {
	
	source := "Reminder_Send_With_Retry"
	workflowID := "reminder-send-retry-v1"
	version := "1.0.0"

	// Format message
	text := fmt.Sprintf(
		"⏰ *Recordatorio de Reserva*\\.\n\n"+
			"📋 *Detalles:*\n"+
			"ID de Reserva: \\`%s\\`\n"+
			"Servicio: %s\n"+
			"Fecha: %s\n\n"+
			"Tu reserva es en *%d horas*\\.",
		bookingID,
		serviceName,
		startTime,
		hoursBefore,
	)

	resp := SendMessageWithRetry(chatID, text, "MarkdownV2")

	// Override meta for reminder context
	resp.Meta.Source = source
	resp.Meta.WorkflowID = workflowID
	resp.Meta.Version = version

	return resp
}
