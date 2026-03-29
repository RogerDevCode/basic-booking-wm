# Telegram Bot API con Windmill y Go - Best Practices

## Webhook Setup y Validación

### Configurar Webhook con Secret Token

```bash
# Setup del webhook con secret_token (Bot API 7.6+)
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://windmill.stax.ink/api/telegram/webhook",
    "secret_token": "your-secret-token-here",
    "allowed_updates": ["message", "channel_post", "callback_query"]
  }'
```

### Validar Secret Token en Go

```go
package inner

import (
    "crypto/subtle"
    "net/http"
    "os"
)

const expectedToken = "your-secret-token-here" // Guardar en variable de entorno

// Middleware para validar webhook
func validateTelegramWebhook(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Obtener header de Telegram
        receivedToken := r.Header.Get("X-Telegram-Bot-Api-Secret-Token")
        
        // Validar con constant-time comparison
        if subtle.ConstantTimeCompare(
            []byte(receivedToken),
            []byte(expectedToken),
        ) != 1 {
            http.Error(w, "Invalid token", http.StatusUnauthorized)
            return
        }
        
        next(w, r)
    }
}

// Handler principal
func telegramWebhookHandler(w http.ResponseWriter, r *http.Request) {
    // Validar método
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    
    // Parsear payload
    var update struct {
        UpdateID int `json:"update_id"`
        Message  struct {
            MessageID int `json:"message_id"`
            From      struct {
                ID        int    `json:"id"`
                FirstName string `json:"first_name"`
                Username  string `json:"username"`
            } `json:"from"`
            Chat struct {
                ID       int    `json:"id"`
                Type     string `json:"type"`
                FirstName string `json:"first_name"`
            } `json:"chat"`
            Date int    `json:"date"`
            Text string `json:"text"`
        } `json:"message"`
    }
    
    if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    
    // Extraer datos
    chatID := update.Message.Chat.ID
    text := update.Message.Text
    username := update.Message.From.FirstName
    
    // Procesar mensaje
    // ...
    
    // Responder rápido (Telegram espera < 3s)
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]any{
        "status": "processing",
    })
}
```

### Verificar Webhook

```bash
# Verificar estado
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"

# Respuesta esperada:
{
  "ok": true,
  "result": {
    "url": "https://windmill.stax.ink/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "allowed_updates": ["message", "channel_post"]
  }
}
```

## Rate Limiting

### Límites de Telegram

| Tipo | Límite | Cuándo Aplica |
|------|--------|---------------|
| **Global** | 30 msg/s | Diferentes chats |
| **Mismo chat** | 1 msg/s | Mismo usuario/chat |
| **Broadcast pagado** | 1000 msg/s | Con Telegram Stars |

### Error 429 Handling

```go
type TelegramError struct {
    OK          bool   `json:"ok"`
    ErrorCode   int    `json:"error_code"`
    Description string `json:"description"`
    Parameters  struct {
        RetryAfter int `json:"retry_after"`
    } `json:"parameters"`
}

// Manejar error 429
func sendMessageWithRetry(ctx context.Context, chatID, text string) error {
    const maxRetries = 3
    
    for attempt := 0; attempt < maxRetries; attempt++ {
        err := sendMessage(chatID, text)
        if err == nil {
            return nil
        }
        
        var tgErr *TelegramError
        if errors.As(err, &tgErr) {
            if tgErr.ErrorCode == 429 {
                retryAfter := tgErr.Parameters.RetryAfter
                if retryAfter == 0 {
                    retryAfter = 60 // Default si no especifica
                }
                
                fmt.Printf("Rate limited, waiting %d seconds\n", retryAfter)
                
                select {
                case <-time.After(time.Duration(retryAfter) * time.Second):
                    continue // Reintentar
                case <-ctx.Done():
                    return ctx.Err()
                }
            }
        }
        
        // Error no recuperable
        return err
    }
    
    return fmt.Errorf("max retries exceeded")
}
```

### Token Bucket Rate Limiter

```go
import "golang.org/x/time/rate"

// Rate limiter global (30 msg/s)
var globalLimiter = rate.NewLimiter(rate.Limit(30), 30)

// Rate limiter por chat (1 msg/s)
var chatLimiters = make(map[int]*rate.Limiter)
var chatLimitersMu sync.Mutex

func getChatLimiter(chatID int) *rate.Limiter {
    chatLimitersMu.Lock()
    defer chatLimitersMu.Unlock()
    
    if limiter, ok := chatLimiters[chatID]; ok {
        return limiter
    }
    
    // Crear nuevo limiter para este chat (1 msg/s, burst de 5)
    limiter := rate.NewLimiter(rate.Limit(1), 5)
    chatLimiters[chatID] = limiter
    return limiter
}

// Enviar mensaje con rate limiting
func sendMessageWithRateLimit(ctx context.Context, chatID, text string) error {
    // Esperar token global
    if err := globalLimiter.Wait(ctx); err != nil {
        return err
    }
    
    // Esperar token del chat
    chatLimiter := getChatLimiter(chatID)
    if err := chatLimiter.Wait(ctx); err != nil {
        return err
    }
    
    // Enviar mensaje
    return sendMessage(chatID, text)
}
```

### Cola de Mensajes (Queue)

```go
type MessageQueue struct {
    messages chan Message
    wg       sync.WaitGroup
}

type Message struct {
    ChatID string
    Text   string
    Retry  int
}

func NewMessageQueue(workers int) *MessageQueue {
    mq := &MessageQueue{
        messages: make(chan Message, 1000), // Buffer de 1000
    }
    
    // Start workers
    for i := 0; i < workers; i++ {
        mq.wg.Add(1)
        go mq.worker()
    }
    
    return mq
}

func (mq *MessageQueue) worker() {
    defer mq.wg.Done()
    
    for msg := range mq.messages {
        err := sendMessageWithRateLimit(context.Background(), msg.ChatID, msg.Text)
        if err != nil {
            // Reintentar si hay espacio
            if msg.Retry < 3 {
                msg.Retry++
                select {
                case mq.messages <- msg:
                default:
                    // Queue llena, loggear error
                }
            }
        }
    }
}

func (mq *MessageQueue) Send(chatID, text string) {
    mq.messages <- Message{
        ChatID: chatID,
        Text:   text,
        Retry:  0,
    }
}

func (mq *MessageQueue) Shutdown() {
    close(mq.messages)
    mq.wg.Wait()
}

// Uso global
var messageQueue = NewMessageQueue(3) // 3 workers

// En cualquier parte del código:
messageQueue.Send(chatID, "Mensaje a enviar")
```

## MarkdownV2 Formatting

### Caracteres Especiales a Escapear

```go
// Caracteres que requieren escape en MarkdownV2
var markdownV2SpecialChars = []string{
    `_`, `*`, `[`, `]`, `(`, `)`, `~`,
    "`", `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`,
}

// Función para escapar texto
func escapeMarkdownV2(text string) string {
    escaped := text
    for _, char := range markdownV2SpecialChars {
        escaped = strings.ReplaceAll(escaped, char, "\\"+char)
    }
    return escaped
}

// Función para escapar selectivamente (preserva formatting)
func escapeForMarkdownV2(text string) string {
    // Escapar backslash primero
    text = strings.ReplaceAll(text, `\`, `\\`)
    
    // Escapar caracteres especiales fuera de tags
    // Esta es una versión simplificada - usar librería para producción
    return escapeMarkdownV2(text)
}
```

### Formateo de Mensajes

```go
// Mensaje con formatting
func formatBookingConfirmation(booking Booking) string {
    text := `✅ *Reserva Confirmada*

📋 *Detalles:*
ID de Reserva: `%s`
Proveedor: %s
Servicio: %s
Fecha: %s

Gracias por confiar en nosotros! 🎉`
    
    return fmt.Sprintf(text,
        escapeMarkdownV2(booking.ID),
        escapeMarkdownV2(booking.ProviderName),
        escapeMarkdownV2(booking.ServiceName),
        escapeMarkdownV2(booking.StartTime.Format("02/01/2006 15:04")),
    )
}

// Enviar con ParseMode
func sendBookingConfirmation(chatID string, booking Booking) error {
    text := formatBookingConfirmation(booking)
    
    req := map[string]any{
        "chat_id":    chatID,
        "text":       text,
        "parse_mode": "MarkdownV2",
    }
    
    return sendTelegramRequest(req)
}
```

### Ejemplos de Formatting

```go
// Bold
fmt.Sprintf("*texto en negrita*")

// Italic
fmt.Sprintf("_texto en cursiva_")

// Underline
fmt.Sprintf("__texto subrayado__")

// Strikethrough
fmt.Sprintf("~texto tachado~")

// Inline code
fmt.Sprintf("`código inline`")

// Code block
fmt.Sprintf("```\nbloque de código\n```")

// Link
fmt.Sprintf("[texto](https://example.com)")

// Mention
fmt.Sprintf("[@username](tg://user?id=%d)", userID)

// Ejemplo combinado
message := `*Nuevo Booking*

Cliente: _` + escapeMarkdownV2(clientName) + `_
Fecha: ` + fmt.Sprintf("`%s`", date) + `
[Ver detalles](https://example.com/booking/` + bookingID + `)`
```

## Parseo de Mensajes

### Estructura de Update

```go
type Update struct {
    UpdateID int `json:"update_id"`
    
    // Uno de estos campos estará presente
    Message         *Message        `json:"message,omitempty"`
    EditedMessage   *Message        `json:"edited_message,omitempty"`
    ChannelPost     *Message        `json:"channel_post,omitempty"`
    CallbackQuery   *CallbackQuery  `json:"callback_query,omitempty"`
    InlineQuery     *InlineQuery    `json:"inline_query,omitempty"`
}

type Message struct {
    MessageID int    `json:"message_id"`
    From      *User  `json:"from,omitempty"`
    Chat      *Chat  `json:"chat"`
    Date      int    `json:"date"`
    Text      string `json:"text,omitempty"`
    
    // Para bots con inline keyboard
    ReplyToMessage *Message `json:"reply_to_message,omitempty"`
    
    // Datos de callback query
    CallbackQuery *CallbackQuery `json:"callback_query,omitempty"`
}

type User struct {
    ID        int    `json:"id"`
    FirstName string `json:"first_name"`
    LastName  string `json:"last_name,omitempty"`
    Username  string `json:"username,omitempty"`
}

type Chat struct {
    ID        int    `json:"id"`
    Type      string `json:"type"` // "private", "group", "supergroup", "channel"
    FirstName string `json:"first_name,omitempty"`
    LastName  string `json:"last_name,omitempty"`
    Username  string `json:"username,omitempty"`
}
```

### Extractor de Datos

```go
func parseTelegramUpdate(update Update) (*MessageData, error) {
    var msg *Message
    
    // Determinar tipo de mensaje
    switch {
    case update.Message != nil:
        msg = update.Message
    case update.EditedMessage != nil:
        msg = update.EditedMessage
    case update.ChannelPost != nil:
        msg = update.ChannelPost
    default:
        return nil, fmt.Errorf("unsupported update type")
    }
    
    // Validar campos requeridos
    if msg.Chat == nil {
        return nil, fmt.Errorf("missing chat information")
    }
    
    return &MessageData{
        ChatID:    msg.Chat.ID,
        ChatType:  msg.Chat.Type,
        UserID:    msg.From.ID,
        Username:  msg.From.FirstName,
        Text:      msg.Text,
        MessageID: msg.MessageID,
        Date:      time.Unix(int64(msg.Date), 0),
    }, nil
}
```

## Flujo de Conversación (Conversation Flow)

### Máquina de Estados

```go
// Estados de conversación
type ConversationState string

const (
    StateIdle              ConversationState = "idle"
    StateSelectingProvider ConversationState = "selecting_provider"
    StateSelectingService  ConversationState = "selecting_service"
    StateSelectingTime     ConversationState = "selecting_time"
    StateConfirming        ConversationState = "confirming"
)

// Sesión de usuario
type UserSession struct {
    ChatID      int64             `json:"chat_id"`
    State       ConversationState `json:"state"`
    ProviderID  int               `json:"provider_id,omitempty"`
    ServiceID   int               `json:"service_id,omitempty"`
    StartTime   time.Time         `json:"start_time,omitempty"`
    CreatedAt   time.Time         `json:"created_at"`
    ExpiresAt   time.Time         `json:"expires_at"`
}

// Storage en Redis
type SessionStore struct {
    rdb *redis.Client
}

func (s *SessionStore) Get(chatID int64) (*UserSession, error) {
    key := fmt.Sprintf("session:%d", chatID)
    
    data, err := s.rdb.Get(context.Background(), key).Result()
    if err == redis.Nil {
        return nil, nil // Sesión no existe
    }
    if err != nil {
        return nil, err
    }
    
    var session UserSession
    if err := json.Unmarshal([]byte(data), &session); err != nil {
        return nil, err
    }
    
    // Verificar expiración
    if time.Now().After(session.ExpiresAt) {
        s.Delete(chatID)
        return nil, nil
    }
    
    return &session, nil
}

func (s *SessionStore) Set(chatID int64, session *UserSession) error {
    key := fmt.Sprintf("session:%d", chatID)
    session.ExpiresAt = time.Now().Add(30 * time.Minute) // TTL 30 min
    
    data, _ := json.Marshal(session)
    return s.rdb.Set(context.Background(), key, data, 30*time.Minute).Err()
}

func (s *SessionStore) Delete(chatID int64) error {
    key := fmt.Sprintf("session:%d", chatID)
    return s.rdb.Del(context.Background(), key).Err()
}
```

### Handler de Estados

```go
func handleConversation(ctx context.Context, chatID int64, text string) error {
    // Obtener sesión
    session, err := sessionStore.Get(chatID)
    if err != nil {
        return err
    }
    
    // Si no hay sesión, crear una nueva
    if session == nil {
        session = &UserSession{
            ChatID:    chatID,
            State:     StateIdle,
            CreatedAt: time.Now(),
        }
    }
    
    // Procesar según estado
    switch session.State {
    case StateIdle:
        return handleIdleState(ctx, session, text)
    case StateSelectingProvider:
        return handleSelectingProviderState(ctx, session, text)
    case StateSelectingService:
        return handleSelectingServiceState(ctx, session, text)
    case StateSelectingTime:
        return handleSelectingTimeState(ctx, session, text)
    case StateConfirming:
        return handleConfirmingState(ctx, session, text)
    default:
        // Resetear estado desconocido
        session.State = StateIdle
        return sessionStore.Set(chatID, session)
    }
}

// Handler: Estado Idle
func handleIdleState(ctx context.Context, session *UserSession, text string) error {
    // Detectar intención con AI
    intent := detectIntent(text)
    
    switch intent {
    case "create_appointment":
        // Mostrar lista de proveedores
        providers, _ := getProviders()
        message := "📋 *Selecciona un proveedor:*\n\n"
        for i, p := range providers {
            message += fmt.Sprintf("%d. %s\n", i+1, escapeMarkdownV2(p.Name))
        }
        
        sendTelegramMessage(session.ChatID, message, "MarkdownV2")
        
        session.State = StateSelectingProvider
        return sessionStore.Set(session.ChatID, session)
        
    case "check_availability":
        sendTelegramMessage(session.ChatID, "📅 Verificando disponibilidad...", "")
        // ...
        
    default:
        sendTelegramMessage(session.ChatID, 
            "👋 Hola! Soy tu asistente de reservas.\n\n"+
            "¿Qué te gustaría hacer?\n"+
            "- Reservar una cita\n"+
            "- Ver disponibilidad\n"+
            "- Cancelar reserva",
            "MarkdownV2")
    }
    
    return nil
}

// Handler: Seleccionando Proveedor
func handleSelectingProviderState(ctx context.Context, session *UserSession, text string) error {
    // Parsear selección (número o nombre)
    providerID, err := parseProviderSelection(text)
    if err != nil {
        sendTelegramMessage(session.ChatID, 
            "❌ Por favor selecciona un número válido de la lista", "")
        return nil
    }
    
    session.ProviderID = providerID
    session.State = StateSelectingService
    
    // Mostrar servicios
    services, _ := getServicesByProvider(providerID)
    message := "🎯 *Selecciona un servicio:*\n\n"
    for i, s := range services {
        message += fmt.Sprintf("%d. %s (%d min)\n", 
            i+1, escapeMarkdownV2(s.Name), s.Duration)
    }
    
    sendTelegramMessage(session.ChatID, message, "MarkdownV2")
    return sessionStore.Set(session.ChatID, session)
}

// Handler: Confirmando
func handleConfirmingState(ctx context.Context, session *UserSession, text string) error {
    // Confirmar o cancelar
    if strings.ToLower(text) == "confirmar" || strings.ToLower(text) == "si" {
        // Crear booking
        booking, err := createBooking(session.ProviderID, session.ServiceID, session.StartTime)
        if err != nil {
            sendTelegramMessage(session.ChatID, 
                "❌ Error al crear la reserva. Inténtalo de nuevo.", "")
            return err
        }
        
        // Enviar confirmación
        sendBookingConfirmation(session.ChatID, booking)
        
        // Resetear sesión
        session.State = StateIdle
        session.ProviderID = 0
        session.ServiceID = 0
        return sessionStore.Set(session.ChatID, session)
    }
    
    // Cancelar
    sendTelegramMessage(session.ChatID, "❌ Reserva cancelada. ¿Qué más puedo ayudarte?", "")
    session.State = StateIdle
    return sessionStore.Set(session.ChatID, session)
}
```

### Timeout de Sesión

```go
// Limpiar sesiones expiradas
func cleanupExpiredSessions() {
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()
    
    for range ticker.C {
        // Redis maneja TTL automáticamente
        // Solo logging
        fmt.Println("Session cleanup completed")
    }
}

// Notificar timeout al usuario
func handleSessionTimeout(chatID int64) error {
    message := "⏰ *Sesión Expirada*\n\n" +
        "Tu sesión ha expirado por inactividad.\n" +
        "Por favor inicia el proceso de nuevo.\n\n" +
        "Escribe /start para comenzar."
    
    return sendTelegramMessage(chatID, message, "MarkdownV2")
}
```

## Errores Comunes

### ❌ No Validar Secret Token

```go
// MAL: Sin validación
func webhookHandler(w http.ResponseWriter, r *http.Request) {
    // Cualquiera puede enviar requests falsos!
}

// BIEN: Con validación
func webhookHandler(w http.ResponseWriter, r *http.Request) {
    token := r.Header.Get("X-Telegram-Bot-Api-Secret-Token")
    if subtle.ConstantTimeCompare([]byte(token), []byte(expectedToken)) != 1 {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }
}
```

### ❌ No Manejar Rate Limits

```go
// MAL: Enviar sin control
for _, chatID := range chatIDs {
    sendMessage(chatID, message) // Puede causar 429!
}

// BIEN: Con rate limiter
for _, chatID := range chatIDs {
    if err := globalLimiter.Wait(ctx); err != nil {
        break
    }
    sendMessage(chatID, message)
}
```

### ❌ No Escapear MarkdownV2

```go
// MAL: Texto sin escape
text := fmt.Sprintf("*%s*", userName) // Si userName tiene "*", rompe formatting

// BIEN: Con escape
text := fmt.Sprintf("*%s*", escapeMarkdownV2(userName))
```

### ❌ No Manejar Sesiones

```go
// MAL: Sin estado, cada mensaje es independiente
func handleMessage(chatID, text string) {
    // No sabe en qué paso del flujo está el usuario
}

// BIEN: Con máquina de estados
func handleMessage(chatID, text string) {
    session := getSession(chatID)
    switch session.State {
    case StateSelectingProvider:
        // ...
    }
}
```

## Checklist Producción

- [ ] Webhook con secret_token configurado
- [ ] Validación de header X-Telegram-Bot-Api-Secret-Token
- [ ] HTTPS obligatorio en webhook URL
- [ ] Rate limiter global (30 msg/s) y por chat (1 msg/s)
- [ ] Manejo de error 429 con retry_after
- [ ] Cola de mensajes para broadcasts
- [ ] Función escapeMarkdownV2 para todo texto de usuario
- [ ] Máquina de estados para conversación
- [ ] Sesiones en Redis con TTL (30 min)
- [ ] Timeout de sesión con notificación
- [ ] Logging estructurado de errores
- [ ] Monitoreo de tasa de entrega
