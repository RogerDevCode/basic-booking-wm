package inner

import (
	"booking-titanium-wm/internal/communication"
	"fmt"
)

// TelegramMessageInput input para enviar mensaje de Telegram
type TelegramMessageInput struct {
	ChatID      string        `json:"chat_id"`
	Text        string        `json:"text"`
	ParseMode   string        `json:"parse_mode,omitempty"`   // "MarkdownV2", "HTML", ""
	ReplyMarkup *ReplyMarkup  `json:"reply_markup,omitempty"` // Botones inline
}

// ReplyMarkup representa teclado inline para botones
type ReplyMarkup struct {
	InlineKeyboard [][]InlineKeyboardButton `json:"inline_keyboard"`
}

// InlineKeyboardButton representa un botón inline
type InlineKeyboardButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
	URL          string `json:"url,omitempty"`
}

// TelegramSendResult resultado del envío
type TelegramSendResult struct {
	Success   bool        `json:"success"`
	MessageID int         `json:"message_id,omitempty"`
	ChatID    string      `json:"chat_id"`
	Data      interface{} `json:"data,omitempty"`
	Error     string      `json:"error,omitempty"`
}

// main envía mensaje de Telegram con soporte para formato enriquecido y botones
func main(input TelegramMessageInput) (TelegramSendResult, error) {
	result := TelegramSendResult{
		Success: false,
		ChatID:  input.ChatID,
	}

	// Validar input
	if input.ChatID == "" {
		result.Error = "validation: chat_id is required"
		return result, nil
	}

	if input.Text == "" {
		result.Error = "validation: text is required"
		return result, nil
	}

	// Set parse mode default
	parseMode := input.ParseMode
	if parseMode == "" {
		parseMode = "MarkdownV2" // Default para formato enriquecido
	}

	// Enviar mensaje
	response := communication.SendMessage(input.ChatID, input.Text, parseMode)

	if !response.Success {
		errorMsg := "Unknown error"
		if response.ErrorMessage != nil {
			errorMsg = *response.ErrorMessage
		}
		result.Error = fmt.Sprintf("telegram send failed: %s", errorMsg)
		return result, nil
	}

	result.Success = true
	if response.Data != nil {
		if msgID, ok := (*response.Data)["message_id"].(int); ok {
			result.MessageID = msgID
		}
		result.Data = response.Data
	}

	return result, nil
}

// SendWithInlineButtons envía mensaje con botones inline (helper)
func SendWithInlineButtons(chatID, text string, buttons [][]InlineKeyboardButton) (TelegramSendResult, error) {
	input := TelegramMessageInput{
		ChatID:    chatID,
		Text:      text,
		ParseMode: "MarkdownV2",
		ReplyMarkup: &ReplyMarkup{
			InlineKeyboard: buttons,
		},
	}

	return main(input)
}

// BuildSuggestionButtons construye botones inline desde sugerencias
func BuildSuggestionButtons(suggestions []Suggestion) [][]InlineKeyboardButton {
	keyboard := make([][]InlineKeyboardButton, 0)

	// Máximo 5 botones para no saturar
	maxButtons := 5
	if len(suggestions) < maxButtons {
		maxButtons = len(suggestions)
	}

	row := make([]InlineKeyboardButton, 0)
	for i := 0; i < maxButtons; i++ {
		suggestion := suggestions[i]

		button := InlineKeyboardButton{
			Text: suggestion.Title,
		}

		// Si tiene action_url, usar URL
		if suggestion.ActionURL != "" {
			button.URL = suggestion.ActionURL
		} else {
			// Si no, usar callback_data
			button.CallbackData = fmt.Sprintf("%s_%d", suggestion.Type, i)
		}

		row = append(row, button)

		// Nueva fila cada 2 botones (para mejor UX en móvil)
		if len(row) >= 2 {
			keyboard = append(keyboard, row)
			row = make([]InlineKeyboardButton, 0)
		}
	}

	// Agregar última fila si queda algo
	if len(row) > 0 {
		keyboard = append(keyboard, row)
	}

	return keyboard
}

// Suggestion representa una sugerencia (compatibilidad con availability_smart_search)
type Suggestion struct {
	Type        string `json:"type"`
	Priority    int    `json:"priority"`
	Title       string `json:"title"`
	Description string `json:"description"`
	ActionURL   string `json:"action_url,omitempty"`
}
