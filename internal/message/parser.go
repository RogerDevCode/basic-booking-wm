package message

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// ParsedMessage representa un mensaje parseado de Telegram
type ParsedMessage struct {
	ChatID   string `json:"chat_id"`
	Text     string `json:"text"`
	Username string `json:"username,omitempty"`
	Type     string `json:"type"` // text, command, booking_intent, etc.
}

// MessageIntent representa la intención detectada en un mensaje
type MessageIntent struct {
	Intent          string            `json:"intent"` // create_booking, cancel_booking, check_availability, etc.
	Confidence      float64           `json:"confidence"`
	ExtractedParams map[string]string `json:"extracted_params"`
}

// ParseTelegramMessage parsea un mensaje de Telegram
func ParseTelegramMessage(rawMessage json.RawMessage) types.StandardContractResponse[map[string]any] {
	source := "NN_02_Message_Parser"
	workflowID := "message-parser-v1"
	version := "1.0.0"

	// Parse raw Telegram message
	var telegramMsg struct {
		Message struct {
			Chat struct {
				ID        int64  `json:"id"`
				FirstName string `json:"first_name"`
			} `json:"chat"`
			Text string `json:"text"`
			From struct {
				FirstName string `json:"first_name"`
				Username  string `json:"username"`
			} `json:"from"`
		} `json:"message"`
		ChannelPost struct {
			Chat struct {
				ID int64 `json:"id"`
			} `json:"chat"`
			Text string `json:"text"`
		} `json:"channel_post"`
		CallbackQuery struct {
			From struct {
				ID        int64  `json:"id"`
				FirstName string `json:"first_name"`
			} `json:"from"`
			Message struct {
				Chat struct {
					ID int64 `json:"id"`
				} `json:"chat"`
			} `json:"message"`
			Data string `json:"data"`
		} `json:"callback_query"`
	}

	if err := json.Unmarshal(rawMessage, &telegramMsg); err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeValidationError,
			fmt.Sprintf("Failed to parse Telegram message: %v", err),
			source,
			workflowID,
			version,
		)
	}

	// Extract chat_id and text from different message types
	var chatID string
	var text string
	var username string

	if telegramMsg.Message.Chat.ID != 0 {
		chatID = fmt.Sprintf("%d", telegramMsg.Message.Chat.ID)
		text = telegramMsg.Message.Text
		username = telegramMsg.Message.From.FirstName
		if telegramMsg.Message.From.Username != "" {
			username = telegramMsg.Message.From.Username
		}
	} else if telegramMsg.ChannelPost.Chat.ID != 0 {
		chatID = fmt.Sprintf("%d", telegramMsg.ChannelPost.Chat.ID)
		text = telegramMsg.ChannelPost.Text
		username = "Channel"
	} else if telegramMsg.CallbackQuery.From.ID != 0 {
		chatID = fmt.Sprintf("%d", telegramMsg.CallbackQuery.From.ID)
		text = telegramMsg.CallbackQuery.Data
		username = telegramMsg.CallbackQuery.From.FirstName
	}

	// Validate chat_id
	if chatID == "" {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeMissingField,
			"chat_id is required",
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

	// Sanitize text for SQL
	safeText := utils.SanitizeString(text, 500)
	safeUsername := utils.SanitizeString(username, 100)

	// Detect intent
	intent := DetectIntent(safeText)

	data := map[string]any{
		"chat_id":    chatID,
		"text":       safeText,
		"username":   safeUsername,
		"type":       "text",
		"intent":     intent.Intent,
		"confidence": intent.Confidence,
		"params":     intent.ExtractedParams,
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}

// DetectIntent detecta la intención del mensaje
func DetectIntent(text string) MessageIntent {
	text = strings.ToLower(strings.TrimSpace(text))

	// Patterns for different intents
	patterns := map[string]*regexp.Regexp{
		"create_booking":     regexp.MustCompile(`(reservar|agendar|turno|cita|crear|nueva)`),
		"cancel_booking":     regexp.MustCompile(`(cancelar|eliminar|borrar|anular)`),
		"reschedule_booking": regexp.MustCompile(`(reagendar|cambiar|mover|modificar)`),
		"check_availability": regexp.MustCompile(`(disponibilidad|verificar|consultar|hay)`),
		"find_next":          regexp.MustCompile(`(pr[oó]ximo|siguiente|primero|disponible)`),
		"get_providers":      regexp.MustCompile(`(proveedores|doctores|profesionales)`),
		"get_services":       regexp.MustCompile(`(servicios|tratamientos|consultas)`),
		"get_my_bookings":    regexp.MustCompile(`(mis reservas|mis turnos|ver reservas)`),
		"general_chat":       regexp.MustCompile(`(hola|buenos|gracias|adi[oó]s|chau)`),
	}

	// Calculate confidence for each intent
	type intentScore struct {
		intent     string
		confidence float64
	}

	var scores []intentScore
	for intent, pattern := range patterns {
		matches := pattern.FindAllString(text, -1)
		confidence := float64(len(matches)) / float64(len(text)) * 100
		if confidence > 0 {
			scores = append(scores, intentScore{intent, confidence})
		}
	}

	// Find highest confidence intent
	var detectedIntent MessageIntent
	detectedIntent.Intent = "general_chat"
	detectedIntent.Confidence = 0.5
	detectedIntent.ExtractedParams = make(map[string]string)

	for _, score := range scores {
		if score.confidence > detectedIntent.Confidence {
			detectedIntent.Intent = score.intent
			detectedIntent.Confidence = score.confidence
		}
	}

	// Extract parameters based on intent
	detectedIntent.ExtractedParams = extractParameters(text, detectedIntent.Intent)

	return detectedIntent
}

// extractParameters extrae parámetros del texto según la intención
func extractParameters(text string, intent string) map[string]string {
	params := make(map[string]string)

	switch intent {
	case "create_booking", "check_availability", "find_next":
		// Extract date patterns (YYYY-MM-DD, DD/MM/YYYY, etc.)
		datePatterns := []*regexp.Regexp{
			regexp.MustCompile(`(\d{4}-\d{2}-\d{2})`),
			regexp.MustCompile(`(\d{2}/\d{2}/\d{4})`),
			regexp.MustCompile(`(hoy|mañana|pasado)`),
		}
		for _, pattern := range datePatterns {
			if match := pattern.FindString(text); match != "" {
				params["date"] = match
				break
			}
		}

		// Extract time patterns
		timePattern := regexp.MustCompile(`(\d{1,2}:\d{2})`)
		if match := timePattern.FindString(text); match != "" {
			params["time"] = match
		}

	case "cancel_booking", "reschedule_booking":
		// Extract UUID or booking ID
		uuidPattern := regexp.MustCompile(`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`)
		if match := uuidPattern.FindString(text); match != "" {
			params["booking_id"] = match
		}

		// Extract numeric ID
		idPattern := regexp.MustCompile(`#?(\d+)`)
		if match := idPattern.FindString(text); match != "" {
			if params["booking_id"] == "" {
				params["booking_id"] = match
			}
		}
	}

	return params
}

// FormatResponse formats a response for Telegram
func FormatResponse(chatID string, message string, parseMode string) types.StandardContractResponse[map[string]any] {
	source := "NN_02_Message_Parser"
	workflowID := "message-parser-format-v1"
	version := "1.0.0"

	if parseMode == "" {
		parseMode = "MarkdownV2"
	}

	data := map[string]any{
		"chat_id":    chatID,
		"text":       message,
		"parse_mode": parseMode,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	}

	return utils.SuccessResponse(data, source, workflowID, version)
}
