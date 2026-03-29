package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"booking-titanium-wm/internal/message"
	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type AIAgentRequest struct {
	ChatID  string `json:"chat_id"`
	Text    string `json:"text"`
	Context string `json:"context,omitempty"`
}

type AIAgentResponse struct {
	AIResponse string            `json:"ai_response"`
	Intent     string            `json:"intent"`
	Params     map[string]string `json:"params"`
	NextAction string            `json:"next_action"`
}

type LLMProvider interface {
	ChatCompletion(ctx context.Context, prompt string) (string, error)
	Name() string
}

// ============================================================================
// PROVIDERS (GROQ & OPENAI)
// ============================================================================

type GroqProvider struct {
	APIKey string
	Model  string
}

func (p *GroqProvider) Name() string { return "groq" }
func (p *GroqProvider) ChatCompletion(ctx context.Context, prompt string) (string, error) {
	return callOpenAICompatibleAPI(ctx, "https://api.groq.com/openai/v1/chat/completions", p.APIKey, p.Model, prompt)
}

type OpenAIProvider struct {
	APIKey string
	Model  string
}

func (p *OpenAIProvider) Name() string { return "openai" }
func (p *OpenAIProvider) ChatCompletion(ctx context.Context, prompt string) (string, error) {
	return callOpenAICompatibleAPI(ctx, "https://api.openai.com/v1/chat/completions", p.APIKey, p.Model, prompt)
}

func callOpenAICompatibleAPI(ctx context.Context, url, apiKey, model, prompt string) (string, error) {
	reqBody, _ := json.Marshal(map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"temperature": 0.1,
		"response_format": map[string]string{"type": "json_object"},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(reqBody))
	if err != nil {
		return "", fmt.Errorf("llm.request_creation: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("llm.execution: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("llm.api_error: status=%d body=%s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("llm.decode: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("llm.empty_response")
	}

	return result.Choices[0].Message.Content, nil
}

// ============================================================================
// CORE AI LOGIC (v4.0 Compliance)
// ============================================================================

func CallLLM(ctx context.Context, prompt string) (string, error) {
	providers := []LLMProvider{}

	if key := os.Getenv("GROQ_API_KEY"); key != "" {
		providers = append(providers, &GroqProvider{APIKey: key, Model: "llama-3.3-70b-versatile"})
	}
	if key := os.Getenv("OPENAI_API_KEY"); key != "" {
		providers = append(providers, &OpenAIProvider{APIKey: key, Model: "gpt-4o-mini"})
	}

	if len(providers) == 0 {
		return "", fmt.Errorf("llm.config: no providers configured")
	}

	var lastErr error
	for _, provider := range providers {
		attemptCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		response, err := provider.ChatCompletion(attemptCtx, prompt)
		cancel()

		if err == nil {
			return response, nil
		}
		lastErr = err
	}

	return "", fmt.Errorf("llm.all_providers_failed: %w", lastErr)
}

func ClassifyIntent(ctx context.Context, text string) (message.MessageIntent, error) {
	prompt := fmt.Sprintf(`Classify medical booking intent. 
Intents: create_booking, cancel_booking, reschedule_booking, check_availability, find_next, get_my_bookings, general_question, greeting.
Return JSON: {"intent": "...", "confidence": 0.95}
Message: %s`, text)

	response, err := CallLLM(ctx, prompt)
	if err != nil {
		return message.MessageIntent{}, err
	}

	var result message.MessageIntent
	json.Unmarshal([]byte(response), &result)
	return result, nil
}

func ExtractEntities(ctx context.Context, text string, intent string) (map[string]string, error) {
	prompt := fmt.Sprintf(`Extract UUIDs and ISO8601 dates for intent "%s".
Fields: provider_id, service_id, booking_id, start_time, patient_id.
Return JSON: {"field": "value"}
Message: %s`, intent, text)

	response, err := CallLLM(ctx, prompt)
	if err != nil {
		return nil, err
	}

	var entities map[string]string
	json.Unmarshal([]byte(response), &entities)
	return entities, nil
}

// AIAgent entry point (LAW-04)
func AIAgent(ctx context.Context, req AIAgentRequest) types.StandardContractResponse[map[string]any] {
	source := "NN_03_AI_Agent"
	workflowID := "ai-agent-v4"
	
	// Step 1: Intent
	intent, err := ClassifyIntent(ctx, req.Text)
	if err != nil {
		intent = message.DetectIntent(req.Text) // Fallback
	}

	// Step 2: Entities
	if intent.Intent != "greeting" && intent.Intent != "general_question" {
		extracted, _ := ExtractEntities(ctx, req.Text, intent.Intent)
		intent.ExtractedParams = extracted
	}

	// Step 3: Action & Response
	nextAction := determineNextAction(intent.Intent)
	aiResponse := generateAIResponse(req.Text, intent.Intent, intent.ExtractedParams)

	data := map[string]any{
		"chat_id":     req.ChatID,
		"ai_response": aiResponse,
		"intent":      intent.Intent,
		"params":      intent.ExtractedParams,
		"next_action": nextAction,
	}

	return utils.SuccessResponse(data, source, workflowID, "1.0.0")
}

func determineNextAction(intent string) string {
	actions := map[string]string{
		"create_booking":     "execute:create_booking",
		"cancel_booking":     "execute:cancel_booking",
		"reschedule_booking": "execute:reschedule_booking",
		"check_availability": "execute:check_availability",
		"general_question":   "execute:rag_query",
	}
	if action, ok := actions[intent]; ok {
		return action
	}
	return "respond:general_chat"
}

func generateAIResponse(text, intent string, params map[string]string) string {
	responses := map[string]string{
		"create_booking":   "¡Entendido! Voy a agendar tu cita.",
		"general_question": "Consultando nuestra base de conocimientos...",
		"greeting":         "¡Hola! ¿En qué puedo ayudarte?",
	}
	if r, ok := responses[intent]; ok {
		return r
	}
	return "Procesando tu solicitud..."
}

func PipelineAgent(ctx context.Context, req AIAgentRequest) types.StandardContractResponse[map[string]any] {
	return AIAgent(ctx, req)
}

func ReminderCron() types.StandardContractResponse[map[string]any] {
	return utils.SuccessResponse(map[string]any{"reminders_sent": 0}, "NN_05_Reminder_Cron", "reminder-v1", "1.0.0")
}
