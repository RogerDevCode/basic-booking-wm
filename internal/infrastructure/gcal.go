package infrastructure

import (
	"context"
	"fmt"
	"net/smtp"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// GCalConfig contiene la configuración de Google Calendar
type GCalConfig struct {
	CalendarID string
	Scopes     []string
}

// DefaultGCalConfig retorna la configuración por defecto para GCal
func DefaultGCalConfig() GCalConfig {
	return GCalConfig{
		CalendarID: "primary",
		Scopes:     []string{calendar.CalendarEventsScope, calendar.CalendarScope},
	}
}

// inicializarClienteGCal crea un cliente de Google Calendar con multiplexor
func InicializarClienteGCal(ctx context.Context) (*calendar.Service, error) {
	return InicializarClienteGCalConConfig(ctx, DefaultGCalConfig())
}

// InicializarClienteGCalConConfig crea un cliente con configuración personalizada
func InicializarClienteGCalConConfig(ctx context.Context, config GCalConfig) (*calendar.Service, error) {
	jsonCrudo, err := obtenerSecreto("f/reservas/gcal_sa_json", "DEV_LOCAL_GCAL_JSON")
	if err != nil {
		return nil, err
	}

	// El parser exige un slice de bytes, se castea el string directamente
	creds, err := google.CredentialsFromJSON(ctx, []byte(jsonCrudo), config.Scopes...)
	if err != nil {
		return nil, fmt.Errorf("fallo al decodificar estructura JSON del Service Account: %w", err)
	}

	srv, err := calendar.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		return nil, fmt.Errorf("fallo al inicializar servicio de calendario: %w", err)
	}

	return srv, nil
}

// GetCalendarID retorna el ID del calendario configurado
func GetCalendarID() string {
	calendarID, err := obtenerSecreto("f/reservas/gcal_calendar_id", "DEV_LOCAL_GCAL_CALENDAR_ID")
	if err != nil {
		// Fallback a primary si no está configurado
		return "primary"
	}
	
	if calendarID == "" {
		return "primary"
	}
	
	return calendarID
}

// SMTPConfig contiene la configuración de Gmail SMTP
type SMTPConfig struct {
	Host     string
	Port     string
	AuthType string // "plain" o "oauth2"
}

// DefaultSMTPConfig retorna la configuración por defecto para Gmail SMTP
func DefaultSMTPConfig() SMTPConfig {
	return SMTPConfig{
		Host:     "smtp.gmail.com",
		Port:     "587",
		AuthType: "plain",
	}
}

// inicializarClienteSMTP crea un cliente SMTP con multiplexor
func InicializarClienteSMTP() (smtp.Auth, string, error) {
	return InicializarClienteSMTPConConfig(DefaultSMTPConfig())
}

// InicializarClienteSMTPConConfig crea un cliente SMTP con configuración personalizada
func InicializarClienteSMTPConConfig(config SMTPConfig) (smtp.Auth, string, error) {
	usuario, err := obtenerSecreto("f/reservas/gmail_user", "DEV_LOCAL_GMAIL_USER")
	if err != nil {
		return nil, "", err
	}

	password, err := obtenerSecreto("f/reservas/gmail_app_password", "DEV_LOCAL_GMAIL_PASS")
	if err != nil {
		return nil, "", err
	}

	auth := smtp.PlainAuth("", usuario, password, config.Host)

	// Retorna la interfaz de autenticación y el correo remitente verificado
	return auth, usuario, nil
}
