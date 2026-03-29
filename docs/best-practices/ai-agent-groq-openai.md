# AI Agent con Groq y OpenAI Fallback - Best Practices

## Arquitectura del AI Agent

```
┌─────────────────────────────────────────────────────────────┐
│                    Usuario (Telegram)                        │
│              "Quiero reservar una cita..."                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              AI Agent (Windmill Script)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. Context Manager (Redis)                         │   │
│  │     - Cargar historial de conversación              │   │
│  │     - Máximo 10 turnos                              │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2. Intent Detection (Groq Llama 3.3 70B)           │   │
│  │     - System prompt con schema JSON                 │   │
│  │     - Extraer: intent, entities, confidence         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  3. Fallback Strategy                               │   │
│  │     - Primario: Groq (rápido, barato)               │   │
│  │     - Fallback: OpenAI (si Groq falla)              │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  4. Entity Validation                               │   │
│  │     - Verificar provider_id existe                  │   │
│  │     - Verificar service_id existe                   │   │
│  │     - Parsear datetime                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Booking Orchestrator                            │
│         (Crear reserva si intent = create_appointment)       │
└─────────────────────────────────────────────────────────────┘
```

## Configuración de Proveedores LLM

### Groq (Primario)

```go
package inner

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
    "time"
)

// GroqClient cliente para API de Groq
type GroqClient struct {
    apiKey    string
    httpClient *http.Client
    baseURL   string
}

// GroqMessage representa un mensaje en la conversación
type GroqMessage struct {
    Role    string `json:"role"` // "system", "user", "assistant"
    Content string `json:"content"`
}

// GroqRequest representa una request de chat completion
type GroqRequest struct {
    Model          string        `json:"model"`
    Messages       []GroqMessage `json:"messages"`
    Temperature    float64       `json:"temperature"`
    MaxTokens      int           `json:"max_tokens"`
    ResponseFormat *struct {
        Type string `json:"type"` // "json_object" o "text"
    } `json:"response_format,omitempty"`
    JSONSchema *struct {
        Name   string      `json:"name"`
        Schema interface{} `json:"schema"`
    } `json:"response_format,omitempty"`
}

// GroqResponse representa la respuesta de Groq
type GroqResponse struct {
    ID      string `json:"id"`
    Choices []struct {
        Index   int `json:"index"`
        Message struct {
            Role    string `json:"role"`
            Content string `json:"content"`
        } `json:"message"`
        FinishReason string `json:"finish_reason"`
    } `json:"choices"`
    Usage struct {
        PromptTokens     int `json:"prompt_tokens"`
        CompletionTokens int `json:"completion_tokens"`
        TotalTokens      int `json:"total_tokens"`
    } `json:"usage"`
}

// Nuevo cliente Groq
func NewGroqClient() *GroqClient {
    return &GroqClient{
        apiKey: os.Getenv("GROQ_API_KEY"),
        httpClient: &http.Client{
            Timeout: 30 * time.Second,
        },
        baseURL: "https://api.groq.com/openai/v1",
    }
}

// ChatCompletion llama a la API de Groq
func (c *GroqClient) ChatCompletion(ctx context.Context, messages []GroqMessage, useJSONMode bool) (*GroqResponse, error) {
    req := &GroqRequest{
        Model:       "llama-3.3-70b-versatile",
        Messages:    messages,
        Temperature: 0.7,
        MaxTokens:   1024,
    }
    
    // Habilitar JSON mode si es necesario
    if useJSONMode {
        req.ResponseFormat = &struct {
            Type string `json:"type"`
        }{Type: "json_object"}
    }
    
    // Serializar request
    reqBody, err := json.Marshal(req)
    if err != nil {
        return nil, fmt.Errorf("failed to marshal request: %w", err)
    }
    
    // Crear HTTP request
    httpReq, err := http.NewRequestWithContext(ctx, "POST", 
        c.baseURL+"/chat/completions", bytes.NewReader(reqBody))
    if err != nil {
        return nil, err
    }
    
    // Headers
    httpReq.Header.Set("Content-Type", "application/json")
    httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
    
    // Enviar request
    resp, err := c.httpClient.Do(httpReq)
    if err != nil {
        return nil, fmt.Errorf("failed to send request: %w", err)
    }
    defer resp.Body.Close()
    
    // Verificar status
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("groq API error: status=%d", resp.StatusCode)
    }
    
    // Parsear respuesta
    var groqResp GroqResponse
    if err := json.NewDecoder(resp.Body).Decode(&groqResp); err != nil {
        return nil, fmt.Errorf("failed to decode response: %w", err)
    }
    
    return &groqResp, nil
}
```

### OpenAI (Fallback)

```go
// OpenAIClient cliente para API de OpenAI
type OpenAIClient struct {
    apiKey    string
    httpClient *http.Client
    baseURL   string
}

func NewOpenAIClient() *OpenAIClient {
    return &OpenAIClient{
        apiKey: os.Getenv("OPENAI_API_KEY"),
        httpClient: &http.Client{
            Timeout: 30 * time.Second,
        },
        baseURL: "https://api.openai.com/v1",
    }
}

// OpenAI usa la misma estructura de request/response que Groq
// (Groq es compatible con OpenAI API)
func (c *OpenAIClient) ChatCompletion(ctx context.Context, messages []GroqMessage, useJSONMode bool) (*GroqResponse, error) {
    req := &GroqRequest{
        Model:       "gpt-4o-mini", // Modelo rápido y económico
        Messages:    messages,
        Temperature: 0.7,
        MaxTokens:   1024,
    }
    
    if useJSONMode {
        req.ResponseFormat = &struct {
            Type string `json:"type"`
        }{Type: "json_object"}
    }
    
    // ... (mismo código que Groq, cambiar baseURL y headers)
    
    httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
    
    // ... enviar y parsear
}
```

## Fallback Strategy

### Patrón: Primary + Fallback con Circuit Breaker

```go
// LLMProvider define la interfaz para proveedores LLM
type LLMProvider interface {
    ChatCompletion(ctx context.Context, messages []GroqMessage, useJSONMode bool) (*GroqResponse, error)
    Name() string
}

// MultiProviderClient maneja múltiples proveedores con fallback
type MultiProviderClient struct {
    providers     []LLMProvider
    circuitBreaks map[string]*CircuitBreaker
}

func NewMultiProviderClient() *MultiProviderClient {
    return &MultiProviderClient{
        providers: []LLMProvider{
            NewGroqClient(),    // Primario
            NewOpenAIClient(),  // Fallback
        },
        circuitBreaks: make(map[string]*CircuitBreaker),
    }
}

// ChatCompletionWithFallback intenta proveedores en orden
func (c *MultiProviderClient) ChatCompletionWithFallback(
    ctx context.Context,
    messages []GroqMessage,
    useJSONMode bool,
) (*GroqResponse, string, error) {
    var lastErr error
    
    for i, provider := range c.providers {
        providerName := provider.Name()
        
        // Verificar circuit breaker
        if c.isCircuitOpen(providerName) {
            log.Printf("Circuit breaker open for %s, skipping", providerName)
            continue
        }
        
        // Intentar request
        resp, err := provider.ChatCompletion(ctx, messages, useJSONMode)
        if err == nil {
            // Éxito: registrar y retornar
            if i > 0 {
                log.Printf("Fallback to %s succeeded", providerName)
            }
            return resp, providerName, nil
        }
        
        // Falló: registrar error
        lastErr = err
        log.Printf("Provider %s failed: %v", providerName, err)
        
        // Actualizar circuit breaker
        c.recordFailure(providerName)
    }
    
    // Todos fallaron
    return nil, "", fmt.Errorf("all LLM providers failed: %w", lastErr)
}

// Circuit Breaker simple
type CircuitBreaker struct {
    failures     int
    lastFailure  time.Time
    state        string // "closed", "open", "half-open"
    threshold    int
    timeout      time.Duration
}

func (cb *CircuitBreaker) isOpen() bool {
    if cb.state == "closed" {
        return false
    }
    if cb.state == "open" && time.Since(cb.lastFailure) > cb.timeout {
        cb.state = "half-open"
        return false
    }
    return true
}

func (cb *CircuitBreaker) recordFailure() {
    cb.failures++
    cb.lastFailure = time.Now()
    if cb.failures >= cb.threshold {
        cb.state = "open"
    }
}

func (cb *CircuitBreaker) recordSuccess() {
    cb.failures = 0
    cb.state = "closed"
}
```

## Detección de Intenciones

### System Prompt para Booking

```go
const bookingAgentSystemPrompt = `
Eres un asistente de reservas para un sistema de citas médicas.

Tu tarea es analizar el mensaje del usuario y extraer:
1. La intención (intent)
2. Las entidades relevantes (entities)

## Intenciones Válidas:
- "create_appointment": Quiere reservar una cita
- "cancel_appointment": Quiere cancelar una cita existente
- "reschedule_appointment": Quiere cambiar una cita existente
- "check_availability": Quiere verificar disponibilidad
- "list_providers": Quiere ver lista de proveedores
- "list_services": Quiere ver lista de servicios
- "greeting": Saludo inicial
- "farewell": Despedida
- "thank_you": Agradecimiento
- "unknown": No se pudo determinar

## Entidades a Extraer:
- provider_id: ID numérico del proveedor (si se menciona)
- service_id: ID numérico del servicio (si se menciona)
- start_time: Fecha y hora en formato ISO 8601 (si se menciona)
- date: Fecha en formato YYYY-MM-DD (si se menciona sin hora)
- time: Hora en formato HH:MM (si se menciona sin fecha)

## Reglas:
1. Responde ÚNICAMENTE con JSON válido
2. No incluyas texto fuera del JSON
3. Si una entidad no se menciona, usa null
4. confidence debe ser entre 0.0 y 1.0

## Formato de Respuesta:
{
  "intent": "<intención>",
  "entities": {
    "provider_id": <número o null>,
    "service_id": <número o null>,
    "start_time": "<ISO 8601 o null>",
    "date": "<YYYY-MM-DD o null>",
    "time": "<HH:MM o null>"
  },
  "confidence": <0.0-1.0>,
  "response": "<respuesta natural para el usuario>"
}

## Ejemplos:

Usuario: "Quiero reservar una cita con el proveedor 3 para mañana"
Respuesta:
{
  "intent": "create_appointment",
  "entities": {
    "provider_id": 3,
    "service_id": null,
    "start_time": null,
    "date": "2026-03-28",
    "time": null
  },
  "confidence": 0.95,
  "response": "Claro, puedo ayudarte a reservar una cita con el proveedor 3 para mañana. ¿Qué servicio te gustaría agendar?"
}

Usuario: "Necesito cancelar mi cita del viernes"
Respuesta:
{
  "intent": "cancel_appointment",
  "entities": {
    "provider_id": null,
    "service_id": null,
    "start_time": null,
    "date": null,
    "time": null
  },
  "confidence": 0.9,
  "response": "Entiendo que quieres cancelar tu cita del viernes. ¿Podrías proporcionarme el ID de tu reserva?"
}

Usuario: "Hola, buenos días"
Respuesta:
{
  "intent": "greeting",
  "entities": {
    "provider_id": null,
    "service_id": null,
    "start_time": null,
    "date": null,
    "time": null
  },
  "confidence": 1.0,
  "response": "¡Buenos días! ¿En qué puedo ayudarte hoy?"
}
`
```

### Función de Detección de Intenciones

```go
type IntentDetectionResult struct {
    Intent     string            `json:"intent"`
    Entities   BookingEntities   `json:"entities"`
    Confidence float64           `json:"confidence"`
    Response   string            `json:"response"`
}

type BookingEntities struct {
    ProviderID  *int    `json:"provider_id"`
    ServiceID   *int    `json:"service_id"`
    StartTime   *string `json:"start_time"`
    Date        *string `json:"date"`
    Time        *string `json:"time"`
}

// DetectIntent analiza el mensaje y detecta la intención
func DetectIntent(ctx context.Context, client *MultiProviderClient, chatHistory []GroqMessage, userMessage string) (*IntentDetectionResult, error) {
    // Construir mensajes para el LLM
    messages := []GroqMessage{
        {Role: "system", Content: bookingAgentSystemPrompt},
    }
    
    // Agregar historial de conversación (últimos 10 turnos)
    if len(chatHistory) > 10 {
        chatHistory = chatHistory[len(chatHistory)-10:]
    }
    messages = append(messages, chatHistory...)
    
    // Agregar mensaje actual
    messages = append(messages, GroqMessage{
        Role:    "user",
        Content: userMessage,
    })
    
    // Llamar al LLM con JSON mode
    resp, provider, err := client.ChatCompletionWithFallback(ctx, messages, true)
    if err != nil {
        return nil, err
    }
    
    log.Printf("Intent detection via %s, tokens: %d", provider, resp.Usage.TotalTokens)
    
    // Parsear respuesta JSON
    if len(resp.Choices) == 0 {
        return nil, fmt.Errorf("no choices in LLM response")
    }
    
    var result IntentDetectionResult
    if err := json.Unmarshal([]byte(resp.Choices[0].Message.Content), &result); err != nil {
        return nil, fmt.Errorf("failed to parse LLM JSON response: %w", err)
    }
    
    // Validar resultado
    if result.Intent == "" {
        return nil, fmt.Errorf("intent is empty in LLM response")
    }
    
    return &result, nil
}
```

## Manejo de Contexto Conversacional

### Session Manager en Redis

```go
import (
    "context"
    "encoding/json"
    "fmt"
    "time"
    
    "github.com/redis/go-redis/v9"
)

// ConversationTurn representa un turno de conversación
type ConversationTurn struct {
    Role      string    `json:"role"` // "user" o "assistant"
    Content   string    `json:"content"`
    Timestamp time.Time `json:"timestamp"`
}

// ConversationSession representa una sesión completa
type ConversationSession struct {
    ChatID     string             `json:"chat_id"`
    Turns      []ConversationTurn `json:"turns"`
    CreatedAt  time.Time          `json:"created_at"`
    UpdatedAt  time.Time          `json:"updated_at"`
    Metadata   map[string]any     `json:"metadata"`
}

// SessionManager maneja sesiones de conversación en Redis
type SessionManager struct {
    rdb *redis.Client
    ttl time.Duration
}

func NewSessionManager(rdb *redis.Client, ttl time.Duration) *SessionManager {
    return &SessionManager{
        rdb: rdb,
        ttl: ttl,
    }
}

// Obtener sesión de conversación
func (sm *SessionManager) GetSession(ctx context.Context, chatID string) (*ConversationSession, error) {
    key := fmt.Sprintf("conversation:%s", chatID)
    
    data, err := sm.rdb.Get(ctx, key).Result()
    if err == redis.Nil {
        // Sesión no existe, crear nueva
        return &ConversationSession{
            ChatID:    chatID,
            Turns:     []ConversationTurn{},
            CreatedAt: time.Now(),
            Metadata:  make(map[string]any),
        }, nil
    }
    if err != nil {
        return nil, err
    }
    
    var session ConversationSession
    if err := json.Unmarshal([]byte(data), &session); err != nil {
        return nil, err
    }
    
    return &session, nil
}

// Agregar turno a la sesión
func (sm *SessionManager) AddTurn(ctx context.Context, chatID, role, content string) error {
    key := fmt.Sprintf("conversation:%s", chatID)
    
    // Obtener sesión existente
    session, err := sm.GetSession(ctx, chatID)
    if err != nil {
        return err
    }
    
    // Agregar nuevo turno
    session.Turns = append(session.Turns, ConversationTurn{
        Role:      role,
        Content:   content,
        Timestamp: time.Now(),
    })
    
    // Limitar a 20 turnos (10 idas y vueltas)
    if len(session.Turns) > 20 {
        session.Turns = session.Turns[len(session.Turns)-20:]
    }
    
    session.UpdatedAt = time.Now()
    
    // Serializar y guardar
    data, err := json.Marshal(session)
    if err != nil {
        return err
    }
    
    return sm.rdb.Set(ctx, key, data, sm.ttl).Err()
}

// Obtener historial como mensajes para LLM
func (sm *SessionManager) GetMessagesForLLM(ctx context.Context, chatID string, maxTurns int) ([]GroqMessage, error) {
    session, err := sm.GetSession(ctx, chatID)
    if err != nil {
        return nil, err
    }
    
    // Limitar turnos
    turns := session.Turns
    if maxTurns > 0 && len(turns) > maxTurns {
        turns = turns[len(turns)-maxTurns:]
    }
    
    // Convertir a GroqMessage
    messages := make([]GroqMessage, len(turns))
    for i, turn := range turns {
        messages[i] = GroqMessage{
            Role:    turn.Role,
            Content: turn.Content,
        }
    }
    
    return messages, nil
}

// Limpiar sesión (después de booking completado)
func (sm *SessionManager) ClearSession(ctx context.Context, chatID string) error {
    key := fmt.Sprintf("conversation:%s", chatID)
    return sm.rdb.Del(ctx, key).Err()
}
```

### Uso en Script Windmill

```go
func main(
    ctx context.Context,
    chatID string,
    userMessage string,
) (map[string]any, error) {
    // Inicializar clientes
    llmClient := NewMultiProviderClient()
    sessionManager := NewSessionManager(redisClient, 24*time.Hour)
    
    // 1. Agregar mensaje del usuario al historial
    if err := sessionManager.AddTurn(ctx, chatID, "user", userMessage); err != nil {
        log.Printf("Failed to save user message: %v", err)
    }
    
    // 2. Obtener historial para contexto
    chatHistory, err := sessionManager.GetMessagesForLLM(ctx, chatID, 10)
    if err != nil {
        log.Printf("Failed to get chat history: %v", err)
        chatHistory = []GroqMessage{}
    }
    
    // 3. Detectar intención
    intentResult, err := DetectIntent(ctx, llmClient, chatHistory, userMessage)
    if err != nil {
        return map[string]any{
            "success": false,
            "error":   err.Error(),
        }, nil
    }
    
    // 4. Agregar respuesta del asistente al historial
    if err := sessionManager.AddTurn(ctx, chatID, "assistant", intentResult.Response); err != nil {
        log.Printf("Failed to save assistant response: %v", err)
    }
    
    // 5. Guardar metadata de la sesión
    session, _ := sessionManager.GetSession(ctx, chatID)
    session.Metadata["last_intent"] = intentResult.Intent
    session.Metadata["last_confidence"] = intentResult.Confidence
    
    // 6. Si es booking, extraer entidades y proceder
    if intentResult.Intent == "create_appointment" {
        // Validar entidades
        if intentResult.Entities.ProviderID == nil {
            intentResult.Response = "¿Con qué proveedor te gustaría agendar?"
        } else if intentResult.Entities.ServiceID == nil {
            intentResult.Response = "¿Qué servicio te gustaría agendar?"
        } else if intentResult.Entities.StartTime == nil {
            intentResult.Response = "¿Para qué fecha y hora te gustaría agendar?"
        } else {
            // Todas las entidades presentes, proceder a booking
            // ... llamar a booking orchestrator ...
        }
    }
    
    // 7. Retornar respuesta
    return map[string]any{
        "success":    true,
        "intent":     intentResult.Intent,
        "entities":   intentResult.Entities,
        "confidence": intentResult.Confidence,
        "response":   intentResult.Response,
        "chat_id":    chatID,
    }, nil
}
```

## Parseo de Respuestas JSON

### Validación de Schema

```go
// Validar que la respuesta del LLM cumple con el schema esperado
func validateIntentResponse(result *IntentDetectionResult) error {
    // Validar intent
    validIntents := map[string]bool{
        "create_appointment":   true,
        "cancel_appointment":   true,
        "reschedule_appointment": true,
        "check_availability":   true,
        "list_providers":       true,
        "list_services":        true,
        "greeting":             true,
        "farewell":             true,
        "thank_you":            true,
        "unknown":              true,
    }
    
    if !validIntents[result.Intent] {
        return fmt.Errorf("invalid intent: %s", result.Intent)
    }
    
    // Validar confidence
    if result.Confidence < 0.0 || result.Confidence > 1.0 {
        return fmt.Errorf("confidence out of range: %f", result.Confidence)
    }
    
    // Validar response no vacío
    if result.Response == "" {
        return fmt.Errorf("response is empty")
    }
    
    return nil
}

// Parsear datetime de varias formas
func parseDateTime(dateStr, timeStr string) (*time.Time, error) {
    // Si ya hay start_time en ISO format
    if dateStr != "" && timeStr == "" && len(dateStr) == 19 {
        t, err := time.Parse(time.RFC3339, dateStr)
        if err == nil {
            return &t, nil
        }
    }
    
    // Parsear fecha
    var parsedDate time.Time
    if dateStr != "" {
        layouts := []string{
            "2006-01-02",
            "02/01/2006",
            "02-01-2006",
            "2006/01/02",
        }
        
        var err error
        for _, layout := range layouts {
            parsedDate, err = time.Parse(layout, dateStr)
            if err == nil {
                break
            }
        }
        if err != nil {
            return nil, fmt.Errorf("failed to parse date: %w", err)
        }
    }
    
    // Parsear hora
    if timeStr != "" {
        layouts := []string{
            "15:04",
            "15:04:05",
            "3:04 PM",
            "3:04PM",
        }
        
        var parsedTime time.Time
        var err error
        for _, layout := range layouts {
            parsedTime, err = time.Parse(layout, timeStr)
            if err == nil {
                // Combinar fecha y hora
                if !parsedDate.IsZero() {
                    parsedDate = time.Date(
                        parsedDate.Year(),
                        parsedDate.Month(),
                        parsedDate.Day(),
                        parsedTime.Hour(),
                        parsedTime.Minute(),
                        0, 0,
                        time.UTC,
                    )
                }
                return &parsedDate, nil
            }
        }
    }
    
    if !parsedDate.IsZero() {
        return &parsedDate, nil
    }
    
    return nil, fmt.Errorf("could not parse datetime")
}
```

## Errores Comunes

### ❌ No Validar Respuesta JSON

```go
// MAL: Asumir que el LLM siempre retorna JSON válido
resp, _ := llmClient.ChatCompletion(ctx, messages, true)
var result IntentDetectionResult
json.Unmarshal([]byte(resp.Choices[0].Message.Content), &result)
// ¡Puede fallar si el LLM retorna texto libre!

// BIEN: Validar y manejar error
resp, _ := llmClient.ChatCompletion(ctx, messages, true)
var result IntentDetectionResult
if err := json.Unmarshal([]byte(resp.Choices[0].Message.Content), &result); err != nil {
    log.Printf("LLM returned invalid JSON: %v", err)
    return handleInvalidJSON(resp.Choices[0].Message.Content)
}
if err := validateIntentResponse(&result); err != nil {
    return fmt.Errorf("invalid response schema: %w", err)
}
```

### ❌ No Límite de Contexto

```go
// MAL: Agregar todo el historial sin límite
messages := append(messages, fullChatHistory...)
// ¡Puede exceder el context window del LLM!

// BIEN: Limitar a últimos N turnos
if len(chatHistory) > 10 {
    chatHistory = chatHistory[len(chatHistory)-10:]
}
messages := append(messages, chatHistory...)
```

### ❌ No Manejar Fallback

```go
// MAL: Solo un proveedor
resp, err := groqClient.ChatCompletion(ctx, messages, true)
if err != nil {
    return err // ¡Fallo sin retry!
}

// BIEN: Múltiples proveedores con fallback
resp, provider, err := multiProviderClient.ChatCompletionWithFallback(ctx, messages, true)
if err != nil {
    return fmt.Errorf("all providers failed: %w", err)
}
log.Printf("Successfully used provider: %s", provider)
```

### ❌ No Guardar Contexto

```go
// MAL: Cada mensaje es independiente
func main(chatID, userMessage string) {
    result, _ := DetectIntent(userMessage)
    // ¡No hay memoria de conversación previa!
}

// BIEN: Session manager con Redis
func main(chatID, userMessage string) {
    sessionManager.AddTurn(ctx, chatID, "user", userMessage)
    chatHistory, _ := sessionManager.GetMessagesForLLM(ctx, chatID, 10)
    result, _ := DetectIntent(ctx, chatHistory, userMessage)
    sessionManager.AddTurn(ctx, chatID, "assistant", result.Response)
}
```

### ❌ No Validar Entidades Extraídas

```go
// MAL: Usar entidades sin validar
if result.Intent == "create_appointment" {
    createBooking(result.Entities.ProviderID, ...)
    // ¡ProviderID puede no existir!
}

// BIEN: Verificar en DB
if result.Intent == "create_appointment" {
    if result.Entities.ProviderID != nil {
        exists, _ := providerExists(ctx, db, *result.Entities.ProviderID)
        if !exists {
            result.Response = "El proveedor especificado no existe. ¿Con cuál te gustaría agendar?"
        }
    }
}
```

## Métricas a Monitorear

| Métrica | Alerta Si | Acción |
|---------|-----------|--------|
| LLM error rate | > 5% | Revisar health de proveedores |
| Fallback rate | > 20% | Groq puede estar degradado |
| Avg confidence | < 0.7 | Mejorar prompt o ejemplos |
| Invalid JSON rate | > 2% | Ajustar temperature o prompt |
| Avg tokens per request | > 500 | Optimizar contexto |
| Session memory usage | > 100MB | Reducir TTL o max turns |

## Checklist Producción

- [ ] Groq client configurado con API key
- [ ] OpenAI client como fallback
- [ ] Circuit breaker por proveedor
- [ ] System prompt con schema JSON claro
- [ ] JSON mode habilitado para intent detection
- [ ] Session manager en Redis con TTL
- [ ] Límite de 10-20 turnos por sesión
- [ ] Validación de respuesta JSON
- [ ] Validación de entidades extraídas
- [ ] Logging de tokens y proveedor usado
- [ ] Métricas de error rate y fallback rate
- [ ] Runbook para cambiar proveedor primario
