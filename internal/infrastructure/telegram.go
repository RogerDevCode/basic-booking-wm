package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// TelegramConfig contiene la configuración de Telegram
type TelegramConfig struct {
	Timeout time.Duration
	ParseMode string // "MarkdownV2", "HTML", or ""
}

// DefaultTelegramConfig retorna la configuración por defecto para Telegram
func DefaultTelegramConfig() TelegramConfig {
	return TelegramConfig{
		Timeout:   5 * time.Second,
		ParseMode: "MarkdownV2",
	}
}

// TelegramMensaje es la estructura estricta para el payload de Telegram
type TelegramMensaje struct {
	ChatID    string `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode,omitempty"`
}

// inicializarClienteTelegram crea las credenciales de Telegram con multiplexor
func InicializarClienteTelegram() (string, string, error) {
	token, err := obtenerSecreto("f/reservas/telegram_bot_token", "DEV_LOCAL_TG_TOKEN")
	if err != nil {
		return "", "", err
	}

	chatID, err := obtenerSecreto("f/reservas/telegram_chat_id", "DEV_LOCAL_TG_CHAT")
	if err != nil {
		return "", "", err
	}

	return token, chatID, nil
}

// EnviarAlertaTelegram envía un mensaje con multiplexor
func EnviarAlertaTelegram(mensaje string) error {
	return EnviarAlertaTelegramConConfig(mensaje, DefaultTelegramConfig())
}

// EnviarAlertaTelegramConConfig envía un mensaje con configuración personalizada
func EnviarAlertaTelegramConConfig(mensaje string, config TelegramConfig) error {
	token, chatID, err := InicializarClienteTelegram()
	if err != nil {
		return err
	}

	payload := TelegramMensaje{
		ChatID:    chatID,
		Text:      mensaje,
		ParseMode: config.ParseMode,
	}

	cuerpoJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("fallo al serializar payload de telegram: %w", err)
	}

	urlEndpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)

	ctx, cancel := context.WithTimeout(context.Background(), config.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, urlEndpoint, bytes.NewBuffer(cuerpoJSON))
	if err != nil {
		return fmt.Errorf("fallo al construir request HTTP: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	cliente := &http.Client{Timeout: config.Timeout}
	resp, err := cliente.Do(req)
	if err != nil {
		return fmt.Errorf("fallo de red al contactar API de Telegram: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram rechazó el mensaje. HTTP Status: %d", resp.StatusCode)
	}

	return nil
}

// EnviarMensajeTelegramPersonalizado envía un mensaje con formato específico
func EnviarMensajeTelegramPersonalizado(chatID, mensaje, parseMode string) error {
	token, _, err := InicializarClienteTelegram()
	if err != nil {
		return err
	}

	payload := TelegramMensaje{
		ChatID:    chatID,
		Text:      mensaje,
		ParseMode: parseMode,
	}

	cuerpoJSON, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("fallo al serializar payload: %w", err)
	}

	urlEndpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, urlEndpoint, bytes.NewBuffer(cuerpoJSON))
	if err != nil {
		return fmt.Errorf("fallo al construir request HTTP: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	cliente := &http.Client{Timeout: 5 * time.Second}
	resp, err := cliente.Do(req)
	if err != nil {
		return fmt.Errorf("fallo de red: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram rechazó el mensaje: %d", resp.StatusCode)
	}

	return nil
}
