# Gmail API con Go y OAuth2 Service Account - Best Practices

## Autenticación OAuth2

### Service Account vs App Password

| Método | Cuándo Usar | Ventajas | Desventajas |
|--------|-------------|----------|-------------|
| **Service Account** | Producción, apps empresariales | Sin intervención usuario, domain-wide delegation, más seguro | Requiere Google Workspace, setup más complejo |
| **App Password** | Testing, uso personal | Simple, rápido de configurar | Requiere 2FA, menos seguro, limitado a cuentas personales |

### Setup de Service Account

```bash
# 1. Crear Service Account en Google Cloud Console
# IAM & Admin > Service Accounts > Create Service Account

# 2. Habilitar Gmail API
# APIs & Services > Library > Gmail API > Enable

# 3. Crear clave JSON
# Service Account > Keys > Add Key > Create New Key > JSON

# 4. Domain-wide Delegation (si envías en nombre de usuarios)
# Service Account > Enable G Suite Domain-wide Delegation
# Google Admin > Security > API Controls > Domain-wide Delegation
# Agregar Client ID con scope: https://www.googleapis.com/auth/gmail.send
```

### Scopes Requeridos

```go
import "google.golang.org/api/gmail/v1"

// Scopes disponibles
const (
    // Enviar emails (mínimo recomendado)
    gmail.GmailSendScope = "https://www.googleapis.com/auth/gmail.send"
    
    // Gestionar borradores y enviar
    gmail.GmailComposeScope = "https://www.googleapis.com/auth/gmail.compose"
    
    // Solo lectura
    gmail.GmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly"
    
    // Acceso completo (evitar si es posible)
    gmail.MailGoogleComScope = "https://mail.google.com/"
)
```

## Configuración del Cliente Go

### Con Service Account (Recomendado Producción)

```go
package inner

import (
    "context"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
    "time"
    
    "golang.org/x/oauth2"
    "golang.org/x/oauth2/google"
    "google.golang.org/api/gmail/v1"
    "google.golang.org/api/option"
)

// ServiceAccountKey representa la clave JSON de Service Account
type ServiceAccountKey struct {
    Type         string `json:"type"`
    ProjectID    string `json:"project_id"`
    PrivateKeyID string `json:"private_key_id"`
    PrivateKey   string `json:"private_key"`
    ClientEmail  string `json:"client_email"`
    ClientID     string `json:"client_id"`
    AuthURI      string `json:"auth_uri"`
    TokenURI     string `json:"token_uri"`
}

// Crear cliente Gmail con Service Account
func createGmailClient(ctx context.Context, serviceAccountJSON string, subjectEmail string) (*gmail.Service, error) {
    // Parsear JSON de service account
    var key ServiceAccountKey
    if err := json.Unmarshal([]byte(serviceAccountJSON), &key); err != nil {
        return nil, fmt.Errorf("failed to parse service account key: %w", err)
    }
    
    // Configurar JWT para service account
    conf := &jwt.Config{
        Email:        key.ClientEmail,
        PrivateKey:   []byte(key.PrivateKey),
        Scopes:       []string{gmail.GmailSendScope},
        TokenURL:     key.TokenURI,
        Subject:      subjectEmail, // Email del usuario a impersonar
    }
    
    // Obtener token source
    tokenSource := conf.TokenSource(ctx)
    
    // Crear cliente HTTP
    client := oauth2.NewClient(ctx, tokenSource)
    
    // Inicializar servicio Gmail
    gmailService, err := gmail.NewService(ctx, option.WithHTTPClient(client))
    if err != nil {
        return nil, fmt.Errorf("failed to create Gmail service: %w", err)
    }
    
    return gmailService, nil
}

// Uso en script Windmill
func main(
    ctx context.Context,
    gmailCredentials string, // RT.Gmail o variable de entorno
    toEmail string,
    subject string,
    body string,
) (map[string]any, error) {
    // Crear cliente
    client, err := createGmailClient(ctx, gmailCredentials, "noreply@yourdomain.com")
    if err != nil {
        return nil, err
    }
    
    // Crear y enviar email
    message := createMIMEMessage("noreply@yourdomain.com", toEmail, subject, body)
    
    result, err := client.Users.Messages.Send("me", message).Do()
    if err != nil {
        return nil, fmt.Errorf("failed to send email: %w", err)
    }
    
    return map[string]any{
        "message_id": result.Id,
        "thread_id":  result.ThreadId,
        "status":     "sent",
    }, nil
}
```

### Con OAuth2 User Consent (Testing)

```go
func createGmailClientOAuth2(ctx context.Context, clientSecretJSON string) (*gmail.Service, error) {
    // Leer credenciales
    secret, err := os.ReadFile(clientSecretJSON)
    if err != nil {
        return nil, err
    }
    
    // Configurar OAuth2
    conf, err := google.ConfigFromJSON(secret, gmail.GmailSendScope)
    if err != nil {
        return nil, err
    }
    
    // Flujo de autorización (solo primera vez)
    // ... guardar token en cache/DB
    
    // Crear cliente con token refresh
    client := conf.Client(ctx, cachedToken)
    
    // Crear servicio
    return gmail.NewService(ctx, option.WithHTTPClient(client))
}
```

## Creación de Mensajes MIME

### Email Simple (Texto Plano + HTML)

```go
import (
    "bytes"
    "encoding/base64"
    "fmt"
    "mime/multipart"
    "mime/quotedprintable"
    "net/textproto"
)

func createMIMEMessage(from, to, subject, htmlBody string) *gmail.Message {
    // Crear buffer para el mensaje MIME
    var buf bytes.Buffer
    writer := multipart.NewWriter(&buf)
    writer.SetBoundary("boundary123456")
    
    // Headers principales
    fmt.Fprintf(&buf, "To: %s\r\n", to)
    fmt.Fprintf(&buf, "From: %s\r\n", from)
    fmt.Fprintf(&buf, "Subject: %s\r\n", subject)
    fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
    fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", writer.Boundary())
    
    // Parte de texto plano
    h := make(textproto.MIMEHeader)
    h.Set("Content-Type", "text/plain; charset=UTF-8")
    h.Set("Content-Transfer-Encoding", "quoted-printable")
    
    plainPart, _ := writer.CreatePart(h)
    plainWriter := quotedprintable.NewWriter(plainPart)
    plainWriter.Write([]byte("This is the plain text version of the email."))
    plainWriter.Close()
    
    // Parte HTML
    h.Set("Content-Type", "text/html; charset=UTF-8")
    htmlPart, _ := writer.CreatePart(h)
    htmlWriter := quotedprintable.NewWriter(htmlPart)
    htmlWriter.Write([]byte(htmlBody))
    htmlWriter.Close()
    
    writer.Close()
    
    // Codificar en base64 URL-safe
    message := &gmail.Message{
        Raw: base64.URLEncoding.EncodeToString(buf.Bytes()),
    }
    
    return message
}
```

### Email con Adjuntos

```go
func createMIMEMessageWithAttachment(
    from, to, subject, body string,
    attachments []Attachment,
) *gmail.Message {
    var buf bytes.Buffer
    
    // Headers
    fmt.Fprintf(&buf, "To: %s\r\n", to)
    fmt.Fprintf(&buf, "From: %s\r\n", from)
    fmt.Fprintf(&buf, "Subject: %s\r\n", subject)
    fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
    
    // Mixed boundary para attachments
    mixedBoundary := "mixed-boundary-123456"
    fmt.Fprintf(&buf, "Content-Type: multipart/mixed; boundary=\"%s\"\r\n\r\n", mixedBoundary)
    
    // Parte del cuerpo (alternative: plain + html)
    altBoundary := "alt-boundary-789012"
    fmt.Fprintf(&buf, "--%s\r\n", mixedBoundary)
    fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", altBoundary)
    
    // Plain text
    fmt.Fprintf(&buf, "--%s\r\n", altBoundary)
    fmt.Fprintf(&buf, "Content-Type: text/plain; charset=UTF-8\r\n\r\n")
    fmt.Fprintf(&buf, "%s\r\n", body)
    
    // HTML
    fmt.Fprintf(&buf, "--%s\r\n", altBoundary)
    fmt.Fprintf(&buf, "Content-Type: text/html; charset=UTF-8\r\n\r\n")
    fmt.Fprintf(&buf, "%s\r\n", body)
    fmt.Fprintf(&buf, "--%s--\r\n", altBoundary)
    
    // Adjuntos
    for _, att := range attachments {
        fmt.Fprintf(&buf, "--%s\r\n", mixedBoundary)
        fmt.Fprintf(&buf, "Content-Type: %s\r\n", att.ContentType)
        fmt.Fprintf(&buf, "Content-Transfer-Encoding: base64\r\n")
        fmt.Fprintf(&buf, "Content-Disposition: attachment; filename=\"%s\"\r\n\r\n", att.Filename)
        
        // Codificar archivo en base64
        encoded := base64.StdEncoding.EncodeToString(att.Data)
        // Insertar saltos de línea cada 76 caracteres (RFC 2045)
        for i := 0; i < len(encoded); i += 76 {
            end := i + 76
            if end > len(encoded) {
                end = len(encoded)
            }
            fmt.Fprintf(&buf, "%s\r\n", encoded[i:end])
        }
    }
    
    fmt.Fprintf(&buf, "--%s--\r\n", mixedBoundary)
    
    return &gmail.Message{
        Raw: base64.URLEncoding.EncodeToString(buf.Bytes()),
    }
}

type Attachment struct {
    Filename    string
    ContentType string
    Data        []byte
}
```

### Plantillas HTML

```go
import "html/template"

// Plantilla de email de booking
const bookingTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Reserva Confirmada</h1>
        </div>
        <div class="content">
            <p>Hola {{.UserName}},</p>
            <p>Tu reserva ha sido confirmada exitosamente.</p>
            
            <div class="details">
                <h3>Detalles de la Reserva:</h3>
                <p><strong>ID:</strong> {{.BookingID}}</p>
                <p><strong>Proveedor:</strong> {{.ProviderName}}</p>
                <p><strong>Servicio:</strong> {{.ServiceName}}</p>
                <p><strong>Fecha:</strong> {{.StartTime}}</p>
            </div>
            
            <p>Si necesitas cancelar o reprogramar, por favor responde a este email.</p>
        </div>
        <div class="footer">
            <p>© 2026 Booking Titanium. Todos los derechos reservados.</p>
        </div>
    </div>
</body>
</html>
`

// Renderizar plantilla
func renderBookingEmail(data BookingData) (string, error) {
    tmpl, err := template.New("booking").Parse(bookingTemplate)
    if err != nil {
        return "", err
    }
    
    var buf bytes.Buffer
    if err := tmpl.Execute(&buf, data); err != nil {
        return "", err
    }
    
    return buf.String(), nil
}

// Uso
func sendBookingConfirmationEmail(to, userName, bookingID string) error {
    data := BookingData{
        UserName:     userName,
        BookingID:    bookingID,
        ProviderName: "Dr. García",
        ServiceName:  "Consulta General",
        StartTime:    "27/03/2026 15:00",
    }
    
    htmlBody, err := renderBookingEmail(data)
    if err != nil {
        return err
    }
    
    message := createMIMEMessage(
        "noreply@booking-titanium.com",
        to,
        "Reserva Confirmada - "+bookingID,
        htmlBody,
    )
    
    // Enviar con Gmail API
    // ...
    
    return nil
}
```

## Rate Limiting y Reintentos

### Límites de Gmail API

| Tipo | Límite | Notas |
|------|--------|-------|
| **Envíos por día** | 500 (Gmail free) | Por usuario |
| **Envíos por día** | 2,000 (Workspace) | Por usuario |
| **Quota por segundo** | 250 unidades | Por usuario |
| **Costo por send** | 100 unidades | ~2-3 emails/segundo |

### Manejo de Error 429

```go
import (
    "context"
    "errors"
    "fmt"
    "net/http"
    "strconv"
    "time"
    
    "google.golang.org/api/googleapi"
)

type GmailSendError struct {
    Err        error
    RetryAfter time.Duration
    QuotaExceeded bool
}

func (e *GmailSendError) Error() string {
    return fmt.Sprintf("Gmail API error: %v", e.Err)
}

// Enviar con retry automático
func sendEmailWithRetry(ctx context.Context, service *gmail.Service, message *gmail.Message, maxRetries int) (*gmail.Message, error) {
    var lastErr error
    var sentMessage *gmail.Message
    
    for attempt := 0; attempt < maxRetries; attempt++ {
        sentMessage, lastErr = service.Users.Messages.Send("me", message).Do()
        if lastErr == nil {
            return sentMessage, nil
        }
        
        // Verificar si es error de rate limit
        var gErr *googleapi.Error
        if !errors.As(lastErr, &gErr) {
            // Error no recuperable
            return nil, lastErr
        }
        
        if gErr.Code == 429 {
            // Rate limit exceeded
            retryAfter := parseRetryAfter(gErr.Header.Get("Retry-After"))
            
            if retryAfter == 0 {
                // Calcular backoff exponencial si no hay header
                retryAfter = time.Duration(1<<uint(attempt)) * time.Second
                if retryAfter > 60*time.Second {
                    retryAfter = 60 * time.Second // Cap en 60s
                }
            }
            
            fmt.Printf("Rate limited, waiting %v before retry %d/%d\n", retryAfter, attempt+1, maxRetries)
            
            select {
            case <-time.After(retryAfter):
                continue
            case <-ctx.Done():
                return nil, ctx.Err()
            }
        }
        
        // Otros errores HTTP
        if gErr.Code >= 500 {
            // Server error, reintentar con backoff
            backoff := time.Duration(1<<uint(attempt)) * time.Second
            select {
            case <-time.After(backoff):
                continue
            case <-ctx.Done():
                return nil, ctx.Err()
            }
        }
        
        // Error no recuperable (4xx excepto 429)
        return nil, lastErr
    }
    
    return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
}

func parseRetryAfter(header string) time.Duration {
    if header == "" {
        return 0
    }
    
    // Intentar parsear como segundos
    if seconds, err := strconv.Atoi(header); err == nil {
        return time.Duration(seconds) * time.Second
    }
    
    // Intentar parsear como HTTP-date
    if t, err := http.ParseTime(header); err == nil {
        return time.Until(t)
    }
    
    return 0
}
```

### Cola de Emails (Queue)

```go
type EmailQueue struct {
    messages chan *EmailMessage
    wg       sync.WaitGroup
    service  *gmail.Service
}

type EmailMessage struct {
    To      string
    Subject string
    Body    string
    Retry   int
}

func NewEmailQueue(service *gmail.Service, workers int) *EmailQueue {
    eq := &EmailQueue{
        messages: make(chan *EmailMessage, 1000),
        service:  service,
    }
    
    // Start workers
    for i := 0; i < workers; i++ {
        eq.wg.Add(1)
        go eq.worker()
    }
    
    return eq
}

func (eq *EmailQueue) worker() {
    defer eq.wg.Done()
    
    for msg := range eq.messages {
        message := createMIMEMessage(
            "noreply@booking-titanium.com",
            msg.To,
            msg.Subject,
            msg.Body,
        )
        
        ctx := context.Background()
        _, err := sendEmailWithRetry(ctx, eq.service, message, 3)
        
        if err != nil && msg.Retry < 3 {
            // Reintentar
            msg.Retry++
            select {
            case eq.messages <- msg:
            default:
                // Queue llena, loggear
            }
        }
    }
}

func (eq *EmailQueue) Send(to, subject, body string) {
    eq.messages <- &EmailMessage{
        To:      to,
        Subject: subject,
        Body:    body,
        Retry:   0,
    }
}

func (eq *EmailQueue) Shutdown() {
    close(eq.messages)
    eq.wg.Wait()
}
```

## Monitoreo de Bounces

### Detección de Bounces

```go
// Gmail no tiene webhook nativo para bounces
// Estrategias alternativas:

// 1. Monitorear emails de bounce en bandeja de entrada
func checkBounceEmails(service *gmail.Service) error {
    // Buscar emails de bounce
    query := "from:mailer-daemon OR from:postmaster OR subject:\"Delivery Status Notification\""
    
    msgs, err := service.Users.Messages.List("me").Q(query).Do()
    if err != nil {
        return err
    }
    
    for _, msg := range msgs.Messages {
        // Procesar email de bounce
        email, err := service.Users.Messages.Get("me", msg.Id).Do()
        if err != nil {
            continue
        }
        
        // Extraer email que rebotó
        bouncedEmail := extractBouncedEmail(email)
        if bouncedEmail != "" {
            // Marcar como bounced en DB
            markEmailAsBounced(bouncedEmail)
        }
    }
    
    return nil
}

// 2. Usar Google Pub/Sub para notificaciones (Workspace)
func setupBounceNotifications() {
    // Configurar watch en Gmail API
    // Recibir notificaciones via Pub/Sub
    // Procesar eventos de bounce
}

// 3. Usar servicio de email transaccional (SendGrid, Postmark)
//    que tiene webhooks nativos para bounces
```

### Tabla de Bounces en DB

```sql
CREATE TABLE email_bounces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    bounce_type VARCHAR(50), -- 'hard', 'soft', 'spam'
    reason TEXT,
    booking_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notified_at TIMESTAMPTZ
);

CREATE INDEX idx_bounces_email ON email_bounces(email);
CREATE INDEX idx_bounces_notified ON email_bounces(notified_at) WHERE notified_at IS NULL;

-- Función para verificar antes de enviar
CREATE OR REPLACE FUNCTION should_send_email(to_email VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    -- No enviar si hay bounce hard reciente
    IF EXISTS (
        SELECT 1 FROM email_bounces
        WHERE email = to_email
        AND bounce_type = 'hard'
        AND created_at > NOW() - INTERVAL '30 days'
    ) THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

## Errores Comunes

### ❌ No Manejar Rate Limits

```go
// MAL: Enviar sin control
_, err := service.Users.Messages.Send("me", message).Do()
if err != nil {
    return err // Puede ser 429!
}

// BIEN: Con retry
_, err = sendEmailWithRetry(ctx, service, message, 3)
```

### ❌ No Codificar Base64 Correctamente

```go
// MAL: Base64 estándar
message.Raw = base64.StdEncoding.EncodeToString([]byte(mimeMsg))

// BIEN: Base64 URL-safe para Gmail API
message.Raw = base64.URLEncoding.EncodeToString([]byte(mimeMsg))
```

### ❌ MIME Message Mal Formateado

```go
// MAL: Sin boundaries correctos
fmt.Fprintf(&buf, "Content-Type: multipart/alternative\r\n")
// Falta boundary!

// BIEN: Con boundary
boundary := "unique-boundary-123456"
fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n", boundary)
```

### ❌ No Verificar Bounces

```go
// MAL: Enviar a emails que rebotaron
sendEmail(to, subject, body)

// BIEN: Verificar primero
if shouldSendEmail(to) {
    sendEmail(to, subject, body)
} else {
    log.Printf("Skipping email to bounced address: %s", to)
}
```

## Checklist Producción

- [ ] Service Account con domain-wide delegation
- [ ] Scope mínimo: gmail.send
- [ ] Cliente Gmail con OAuth2 token refresh
- [ ] Plantillas HTML con html/template
- [ ] MIME message con boundaries correctos
- [ ] Base64 URL-safe encoding
- [ ] Rate limiter con retry (429 handling)
- [ ] Cola de emails para broadcasts
- [ ] Monitoreo de bounces
- [ ] Tabla de bounces en DB
- [ ] Logging estructurado de envíos
- [ ] Métricas de entrega (success rate, bounce rate)
