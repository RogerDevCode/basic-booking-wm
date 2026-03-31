package inner

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode"

	"booking-titanium-wm/internal/optimization"
)

// PipelineInput representa el input del pipeline
type PipelineInput struct {
	ChatID      string                 `json:"chat_id"`
	Text        string                 `json:"text"`
	UserProfile map[string]interface{} `json:"user_profile,omitempty"`
	SessionID   string                 `json:"sessionId,omitempty"`
}

// PipelineResult representa el resultado del pipeline
type PipelineResult struct {
	Success       bool                   `json:"success"`
	ChatID        string                 `json:"chat_id"`
	SessionID     string                 `json:"sessionId"`
	Text          string                 `json:"text"`
	Intent        string                 `json:"intent"`
	Entities      map[string]interface{} `json:"entities,omitempty"`
	Confidence    float64                `json:"confidence"`
	IsValid       bool                   `json:"is_valid"`
	Route         string                 `json:"_route"`
	AIResponse    string                 `json:"ai_response,omitempty"`
	RAGContext    string                 `json:"rag_context,omitempty"`
	Error         string                 `json:"error,omitempty"`
	ErrorCode     string                 `json:"error_code,omitempty"`
	NeedsHuman    bool                   `json:"needs_human,omitempty"`
	Monitoring    map[string]interface{} `json:"_monitoring,omitempty"`
}

// PipelineConfig representa la configuración del pipeline
type PipelineConfig struct {
	GroqAPIKey             string
	GroqEndpoint           string
	IntentModel            string
	MinConfidenceThreshold float64
	HumanReviewThreshold   float64
	MaxRetries             int
	BaseBackoff            time.Duration
	RequestTimeout         time.Duration
	EnableMonitoring       bool
}

// DefaultPipelineConfig returns production configuration
func DefaultPipelineConfig() PipelineConfig {
	groqKey := os.Getenv("GROQ_API_KEY")
	if groqKey == "" {
		groqKey = "placeholder_key"
	}

	return PipelineConfig{
		GroqAPIKey:             groqKey,
		GroqEndpoint:           "https://api.groq.com/openai/v1/chat/completions",
		IntentModel:            "llama-3.3-70b-versatile",
		MinConfidenceThreshold: 0.7,
		HumanReviewThreshold:   0.4,
		MaxRetries:             3,
		BaseBackoff:            1 * time.Second,
		RequestTimeout:         30 * time.Second,
		EnableMonitoring:       true,
	}
}

// main ejecuta el pipeline completo OPTIMIZADO
func main(input PipelineInput) (PipelineResult, error) {
	config := DefaultPipelineConfig()

	result := PipelineResult{
		Success:    false,
		ChatID:     input.ChatID,
		SessionID:  input.SessionID,
		Text:       input.Text,
		Intent:     "unknown",
		IsValid:    false,
		Route:      "validation_error",
		Confidence: 0.0,
		NeedsHuman: false,
		Monitoring: make(map[string]interface{}),
	}

	// Step 1: Input Clean
	cleanedInput := inputClean(input)
	result.ChatID = cleanedInput.ChatID
	result.SessionID = cleanedInput.SessionID
	result.Text = cleanedInput.Text

	// Step 2: Payload Validation
	validation := validatePayloadStrict(result.ChatID, result.Text)
	result.IsValid = validation.Valid

	if !validation.Valid {
		result.Error = validation.Message
		result.ErrorCode = validation.ErrorCode
		result.Route = "validation_error"
		return result, nil
	}

	result.Route = "execute"

	// OPTIMIZATION #1: Check greeting cache FIRST (5ms vs 400ms)
	intent, confidence, response, cached := optimization.CheckGreetingCache(result.Text)
	if cached {
		result.Intent = intent
		result.Confidence = confidence
		result.AIResponse = response
		result.Success = true
		if config.EnableMonitoring {
			result.Monitoring["greeting_cached"] = true
			result.Monitoring["latency_saved_ms"] = 400
		}
		return result, nil
	}

	// Step 3: Intent Detection (rule-based fallback)
	intentResult := detectIntentSimple(result.Text)
	result.Intent = intentResult.Intent
	result.Confidence = intentResult.Confidence
	result.Entities = intentResult.Entities

	// Step 4: Confidence-Based Routing
	if result.Confidence < config.HumanReviewThreshold {
		result.NeedsHuman = true
		result.Route = "human_review"
		result.AIResponse = "Voy a conectar tu consulta con un agente humano."
		result.Success = true
		return result, nil
	}

	if result.Confidence < config.MinConfidenceThreshold {
		result.AIResponse = generateClarifyingQuestion(result.Intent, result.Text)
		result.Success = true
		return result, nil
	}

	// Step 5: Generate Response
	result.AIResponse = generateResponse(result.Intent, result.Entities)
	result.Success = true

	_ = context.Background() // Reserved for future Groq integration

	return result, nil
}

// ============================================================================
// OPTIMIZED HELPER FUNCTIONS
// ============================================================================

func inputClean(input PipelineInput) PipelineInput {
	cleaned := PipelineInput{
		ChatID:      strings.TrimSpace(fmt.Sprintf("%v", input.ChatID)),
		Text:        strings.TrimSpace(fmt.Sprintf("%v", input.Text)),
		UserProfile: input.UserProfile,
	}
	if input.SessionID == "" {
		cleaned.SessionID = cleaned.ChatID
	} else {
		cleaned.SessionID = strings.TrimSpace(input.SessionID)
	}
	cleaned.Text = regexp.MustCompile(`\s+`).ReplaceAllString(cleaned.Text, " ")
	return cleaned
}

type validation struct {
	Valid     bool
	Message   string
	ErrorCode string
}

func validatePayloadStrict(chatID, text string) validation {
	if !regexp.MustCompile(`^\d+$`).MatchString(chatID) || len(chatID) == 0 {
		return validation{Valid: false, Message: "chat_id must be numeric", ErrorCode: "INVALID_CHAT_ID"}
	}
	text = strings.TrimSpace(text)
	if len(text) < 2 {
		return validation{Valid: false, Message: "text too short", ErrorCode: "TEXT_TOO_SHORT"}
	}
	if len(text) > 500 {
		return validation{Valid: false, Message: "text too long", ErrorCode: "TEXT_TOO_LONG"}
	}
	for _, r := range text {
		if !unicode.IsPrint(r) && r != '\n' && r != '\r' && r != '\t' {
			return validation{Valid: false, Message: "invalid characters", ErrorCode: "INVALID_CHARACTERS"}
		}
	}
	return validation{Valid: true}
}

type intentResult struct {
	Intent     string
	Confidence float64
	Entities   map[string]interface{}
}

func detectIntentSimple(text string) intentResult {
	textLower := strings.ToLower(text)
	intents := map[string][]string{
		"create_appointment": {"agendar", "reservar", "citar"},
		"cancel_appointment": {"cancelar", "anular"},
		"greeting": {"hola", "buenos"},
		"farewell": {"chau", "adiós", "gracias"},
	}
	bestIntent := "unknown"
	bestScore := 0
	for intent, keywords := range intents {
		for _, keyword := range keywords {
			if strings.Contains(textLower, keyword) {
				bestScore++
				bestIntent = intent
			}
		}
	}
	return intentResult{Intent: bestIntent, Confidence: float64(bestScore) / 3.0, Entities: make(map[string]interface{})}
}

func generateClarifyingQuestion(intent, text string) string {
	questions := map[string]string{
		"create_appointment": "¿Qué día y hora prefieres?",
		"cancel_appointment": "¿Cuál es el ID de tu reserva?",
	}
	if q, ok := questions[intent]; ok {
		return q
	}
	return "¿Podrías darme más detalles?"
}

func generateResponse(intent string, entities map[string]interface{}) string {
	responses := map[string]string{
		"create_appointment": "¡Claro! Puedo ayudarte a agendar una cita.",
		"cancel_appointment": "Entiendo, voy a ayudarte a cancelar.",
		"greeting":           "¡Hola! ¿En qué puedo ayudarte?",
	}
	if r, ok := responses[intent]; ok {
		return r
	}
	return "¿Cómo puedo ayudarte?"
}
