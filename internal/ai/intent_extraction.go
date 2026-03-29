package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"booking-titanium-wm/pkg/logging"
)

var intentLog = logging.GetDefaultLogger()

// ============================================================================
// INTENT CONSTANTS (v4.0 §4.1)
// ============================================================================

const (
	IntentListAvailable   = "list_available"
	IntentCreateBooking   = "create_booking"
	IntentCancelBooking   = "cancel_booking"
	IntentReschedule      = "reschedule"
	IntentGetMyBookings   = "get_my_bookings"
	IntentGeneralQuestion = "general_question"
	IntentGreeting        = "greeting"
	IntentUnknown         = "unknown"
)

// Intent extraction timeout
const (
	LLMTimeoutSeconds     = 30
	MaxRetriesLLM         = 2
	LLMBackoffMilliseconds = 500
)

// ============================================================================
// INTENT RESULT TYPES (v4.0 §4.2)
// ============================================================================

// IntentResult is the structured output of intent extraction.
type IntentResult struct {
	Intent     string                 `json:"intent"`       // One of the defined intents
	Confidence float64                `json:"confidence"`   // 0.0 to 1.0
	Entities   map[string]interface{} `json:"entities"`     // Extracted entities
	RawMessage string                 `json:"raw_message"`  // Original user message
	NeedsMore  bool                   `json:"needs_more"`   // True if more info needed
	FollowUp   string                 `json:"follow_up"`    // Question to ask if needs_more
}

// Entity types that can be extracted (v5.0 - Single Provider Simplified)
// NOTE: provider_name and service_type are NO LONGER extracted
// since there is only ONE provider and ONE service in the system.
const (
	EntityDate        = "date"         // "2025-07-20" or "mañana" or "lunes"
	EntityTime        = "time"         // "10:00" or "por la mañana"
	EntityBookingID   = "booking_id"    // "abc-123"
	EntityPatientName = "patient_name"  // extracted name
	EntityPatientPhone = "patient_phone" // extracted phone
	EntityPatientEmail = "patient_email" // extracted email
	// REMOVED: EntityProvider, EntityService (single-provider system)
)

// ============================================================================
// LLM CLIENT
// ============================================================================

// LLMClient handles communication with LLM providers (Groq, OpenAI)
type LLMClient struct {
	provider     string // "groq" or "openai"
	apiKey       string
	baseURL      string
	model        string
	httpClient   *http.Client
}

// NewLLMClient creates a new LLM client
func NewLLMClient() (*LLMClient, error) {
	// Try Groq first
	apiKey := os.Getenv("GROQ_API_KEY")
	provider := "groq"
	baseURL := "https://api.groq.com/openai/v1/chat/completions"
	model := "llama-3.3-70b-versatile"

	// Fallback to OpenAI
	if apiKey == "" {
		apiKey = os.Getenv("OPENAI_API_KEY")
		provider = "openai"
		baseURL = "https://api.openai.com/v1/chat/completions"
		model = "gpt-4o-mini"
	}

	if apiKey == "" {
		return nil, fmt.Errorf("ai.llm: no API key configured (GROQ_API_KEY or OPENAI_API_KEY)")
	}

	return &LLMClient{
		provider: provider,
		apiKey:   apiKey,
		baseURL:  baseURL,
		model:    model,
		httpClient: &http.Client{
			Timeout: LLMTimeoutSeconds * time.Second,
		},
	}, nil
}

// ChatCompletionRequest represents a request to the LLM API
type ChatCompletionRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature"`
	MaxTokens   int       `json:"max_tokens"`
}

// Message represents a chat message
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatCompletionResponse represents a response from the LLM API
type ChatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// Complete sends a chat completion request and returns the response
func (c *LLMClient) Complete(ctx context.Context, systemPrompt, userMessage string) (string, error) {
	reqBody := ChatCompletionRequest{
		Model: c.model,
		Messages: []Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userMessage},
		},
		Temperature: 0.1, // Low temperature for deterministic output
		MaxTokens:   500,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("ai.llm: failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("ai.llm: failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("ai.llm: request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("ai.llm: failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ai.llm: API returned status %d: %s", resp.StatusCode, string(body))
	}

	var completionResp ChatCompletionResponse
	if err := json.Unmarshal(body, &completionResp); err != nil {
		return "", fmt.Errorf("ai.llm: failed to unmarshal response: %w", err)
	}

	if len(completionResp.Choices) == 0 {
		return "", fmt.Errorf("ai.llm: no choices in response")
	}

	return completionResp.Choices[0].Message.Content, nil
}

// ============================================================================
// INTENT EXTRACTION (v4.0 §4.2)
// ============================================================================

// ExtractIntentFromMessage extracts the user's intent from a natural language message.
// This is the main entry point for intent extraction.
func ExtractIntentFromMessage(
	userMessage string,
	conversationHistory string,
	ragContext string,
) (*IntentResult, error) {

	if userMessage == "" {
		return nil, fmt.Errorf("validation: userMessage cannot be empty")
	}

	// Create LLM client
	client, err := NewLLMClient()
	if err != nil {
		// Fallback to keyword-based extraction
		intentLog.Warn("LLM client not available, using keyword extraction")
		return extractIntentKeywords(userMessage), nil
	}

	// Build system prompt
	systemPrompt := buildIntentSystemPrompt(ragContext)

	// Build user message with context
	userMsg := buildUserMessage(userMessage, conversationHistory)

	// Call LLM with retry
	var content string
	for attempt := 0; attempt < MaxRetriesLLM; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), LLMTimeoutSeconds*time.Second)
		defer cancel()

		content, err = client.Complete(ctx, systemPrompt, userMsg)
		if err == nil {
			break
		}

		if attempt < MaxRetriesLLM-1 {
			time.Sleep(time.Duration(LLMBackoffMilliseconds*(attempt+1)) * time.Millisecond)
		}
	}

	if err != nil {
		intentLog.Error("LLM extraction failed after %d retries: %v", MaxRetriesLLM, err)
		// Fallback to keyword extraction
		return extractIntentKeywords(userMessage), nil
	}

	// Parse LLM response
	result, err := parseIntentResult(content, userMessage)
	if err != nil {
		intentLog.Error("Failed to parse LLM response: %v", err)
		return extractIntentKeywords(userMessage), nil
	}

	// Validate intent
	if !isValidIntent(result.Intent) {
		intentLog.Warn("Invalid intent detected: %s, defaulting to unknown", result.Intent)
		result.Intent = IntentUnknown
		result.Confidence = 0.0
	}

	intentLog.Info("Intent extracted: intent=%s confidence=%.2f message_len=%d",
		result.Intent, result.Confidence, len(userMessage))

	return result, nil
}

// buildIntentSystemPrompt creates the system prompt for intent extraction (v5.0 - Single Provider)
func buildIntentSystemPrompt(ragContext string) string {
	// Simplified prompt for single-provider system (180 tokens vs 280 - 36% reduction)
	prompt := `You are an intent classifier for a SINGLE-PROVIDER medical booking system.

IMPORTANT: There is ONLY ONE provider and ONE service. DO NOT ask about provider or service selection.

Classify into EXACTLY ONE intent:
- list_available: User wants to see available times
- create_booking: User wants to book an appointment
- cancel_booking: User wants to cancel
- reschedule: User wants to reschedule
- get_my_bookings: User wants to see their appointments
- general_question: General questions (hours, location, policies)
- greeting: User is greeting
- unknown: Cannot determine

Extract ONLY these entities: date, time, booking_id, patient_name, patient_email, patient_phone.
DO NOT extract provider_name or service_type (there is only one).

If more info needed, set needs_more=true with follow_up question in Spanish.

Respond in JSON ONLY (no markdown):
{"intent":"...","confidence":0.0-1.0,"entities":{...},"needs_more":bool,"follow_up":"..."}`

	if ragContext != "" {
		prompt += "\n\nContext:\n" + ragContext
	}

	return prompt
}

// buildUserMessage builds the user message with conversation history
func buildUserMessage(userMessage, conversationHistory string) string {
	msg := "User message: " + userMessage

	if conversationHistory != "" {
		msg += "\n\nConversation history:\n" + conversationHistory
	}

	return msg
}

// parseIntentResult parses the LLM response into an IntentResult
func parseIntentResult(content, rawMessage string) (*IntentResult, error) {
	// Clean the response (remove markdown code blocks if present)
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var result IntentResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	result.RawMessage = rawMessage

	// Set defaults
	if result.Entities == nil {
		result.Entities = make(map[string]interface{})
	}

	if result.Confidence < 0.0 || result.Confidence > 1.0 {
		result.Confidence = 0.5
	}

	return &result, nil
}

// isValidIntent checks if the intent is one of the valid intents
func isValidIntent(intent string) bool {
	valid := map[string]bool{
		IntentListAvailable:   true,
		IntentCreateBooking:   true,
		IntentCancelBooking:   true,
		IntentReschedule:      true,
		IntentGetMyBookings:   true,
		IntentGeneralQuestion: true,
		IntentGreeting:        true,
		IntentUnknown:         true,
	}
	return valid[intent]
}

// ============================================================================
// KEYWORD-BASED FALLBACK (when LLM is unavailable)
// ============================================================================

// extractIntentKeywords extracts intent using keyword matching (fallback)
func extractIntentKeywords(message string) *IntentResult {
	message = strings.ToLower(message)

	result := &IntentResult{
		RawMessage: message,
		Entities:   make(map[string]interface{}),
		Confidence: 0.5,
	}

	// Greeting patterns
	greetingKeywords := []string{"hola", "buenos días", "buenas tardes", "buenas noches", "qué tal", "hi", "hello"}
	for _, kw := range greetingKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentGreeting
			result.Confidence = 0.9
			return result
		}
	}

	// Create booking patterns
	createKeywords := []string{"reservar", "agendar", "citar", "quiero una cita", "necesito una cita"}
	for _, kw := range createKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentCreateBooking
			result.Confidence = 0.7
			extractEntities(message, result)
			return result
		}
	}

	// Cancel booking patterns
	cancelKeywords := []string{"cancelar", "anular", "eliminar cita"}
	for _, kw := range cancelKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentCancelBooking
			result.Confidence = 0.7
			extractEntities(message, result)
			return result
		}
	}

	// Reschedule patterns
	rescheduleKeywords := []string{"reprogramar", "cambiar cita", "mover cita"}
	for _, kw := range rescheduleKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentReschedule
			result.Confidence = 0.7
			extractEntities(message, result)
			return result
		}
	}

	// List available patterns
	availableKeywords := []string{"disponibilidad", "horas disponibles", "qué horas hay", "cuándo puedo"}
	for _, kw := range availableKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentListAvailable
			result.Confidence = 0.7
			extractEntities(message, result)
			return result
		}
	}

	// Get my bookings patterns
	myBookingsKeywords := []string{"mis citas", "ver citas", "consultar citas"}
	for _, kw := range myBookingsKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentGetMyBookings
			result.Confidence = 0.7
			return result
		}
	}

	// General question patterns
	questionKeywords := []string{"qué servicios", "dónde están", "cuál es la dirección", "precios", "aceptan seguro"}
	for _, kw := range questionKeywords {
		if strings.Contains(message, kw) {
			result.Intent = IntentGeneralQuestion
			result.Confidence = 0.6
			return result
		}
	}

	// Unknown intent
	result.Intent = IntentUnknown
	result.Confidence = 0.3
	result.NeedsMore = true
	result.FollowUp = "¿Podrías ser más específico sobre qué necesitas? Puedo ayudarte a agendar, cancelar o reprogramar una cita."

	return result
}

// extractEntities extracts entities from message using keyword patterns (v5.0 - Single Provider)
// NOTE: No longer extracts provider_name or service_type since there is only one provider/service
func extractEntities(message string, result *IntentResult) {
	// Extract booking ID (pattern: #ABC123 or ABC-123)
	if strings.Contains(message, "#") {
		parts := strings.Split(message, "#")
		if len(parts) > 1 {
			result.Entities[EntityBookingID] = strings.Split(parts[1], " ")[0]
		}
	}

	// Extract date mentions (simplified)
	dateKeywords := map[string]string{
		"mañana":    "tomorrow",
		"hoy":       "today",
		"pasado":    "day_after_tomorrow",
		"lunes":     "monday",
		"martes":    "tuesday",
		"miércoles": "wednesday",
		"jueves":    "thursday",
		"viernes":   "friday",
		"sábado":    "saturday",
		"domingo":   "sunday",
	}

	for kw, val := range dateKeywords {
		if strings.Contains(message, kw) {
			result.Entities[EntityDate] = val
			break
		}
	}

	// Extract time mentions (simplified)
	if strings.Contains(message, "mañana") && !strings.Contains(message, "día") {
		result.Entities[EntityTime] = "morning"
	}
	if strings.Contains(message, "tarde") {
		result.Entities[EntityTime] = "afternoon"
	}
	if strings.Contains(message, "noche") {
		result.Entities[EntityTime] = "evening"
	}

	// REMOVED: Service extraction (single-provider system)
	// REMOVED: Provider extraction (single-provider system)
}

// ============================================================================
// RAG QUERY HELPER (v4.0 §4.3)
// ============================================================================

// RAGResult represents a RAG query result
type RAGResult struct {
	Answer  string   `json:"answer"`
	Sources []string `json:"sources"`
	Found   bool     `json:"found"`
}

// QueryRAG queries the knowledge base for relevant information
// This should be called before intent extraction for general questions
func QueryRAG(
	query string,
	dbQueryFunc func(query string, topK int) ([]map[string]any, error),
	topK int,
) (*RAGResult, error) {

	if query == "" {
		return &RAGResult{Found: false}, nil
	}

	if topK < 1 || topK > 20 {
		topK = 5
	}

	// Query the knowledge base (using pgvector semantic search)
	results, err := dbQueryFunc(query, topK)
	if err != nil {
		return nil, fmt.Errorf("rag.query: failed to query knowledge base: %w", err)
	}

	if len(results) == 0 {
		return &RAGResult{Found: false}, nil
	}

	// Build answer from top results
	var answer strings.Builder
	var sources []string

	for i, r := range results {
		if content, ok := r["content"].(string); ok {
			if i == 0 {
				answer.WriteString(content)
			}
		}
		if title, ok := r["title"].(string); ok {
			sources = append(sources, title)
		}
	}

	return &RAGResult{
		Answer:  answer.String(),
		Sources: sources,
		Found:   true,
	}, nil
}
