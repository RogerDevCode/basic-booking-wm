package windmill

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// SecretResolver multiplexes between local files and Windmill variables
type SecretResolver struct {
	// LocalEnvVar is the environment variable name for local file path
	LocalEnvVar string
	// WindmillPath is the path to the variable/resource in Windmill
	WindmillPath string
	// Description is a human-readable description for error messages
	Description string
}

// Resolve reads a secret from local file (dev) or Windmill (prod)
func (sr *SecretResolver) Resolve() ([]byte, error) {
	// 1. Try local development mode
	localPath := os.Getenv(sr.LocalEnvVar)
	if localPath != "" {
		// Expand ~ to home directory
		if len(localPath) > 0 && localPath[0] == '~' {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				return nil, fmt.Errorf("windmill.SecretResolver: cannot get home directory: %w", err)
			}
			localPath = filepath.Join(homeDir, localPath[1:])
		}

		// Read local file
		data, err := os.ReadFile(localPath)
		if err != nil {
			return nil, fmt.Errorf("windmill.SecretResolver: failed to read local secret from %s: %w", localPath, err)
		}

		return data, nil
	}

	// 2. Production mode - use Windmill API
	// Note: wmill.GetVariable will be called by the script wrapper
	// This returns a placeholder that will be replaced by actual Windmill variable
	return nil, fmt.Errorf("windmill.SecretResolver: local path not set (%s) and Windmill variable not configured (%s)", 
		sr.LocalEnvVar, sr.WindmillPath)
}

// ResolveJSON reads a secret and unmarshals it into the provided struct
func (sr *SecretResolver) ResolveJSON(target interface{}) error {
	data, err := sr.Resolve()
	if err != nil {
		return err
	}

	if err := json.Unmarshal(data, target); err != nil {
		return fmt.Errorf("windmill.SecretResolver: failed to parse JSON secret: %w", err)
	}

	return nil
}

// ResolveString reads a secret as string (for tokens, passwords, etc.)
func (sr *SecretResolver) ResolveString() (string, error) {
	data, err := sr.Resolve()
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// NewSecretResolver creates a new SecretResolver for Google Calendar credentials
func NewGCALResolver(windmillPath string) *SecretResolver {
	return &SecretResolver{
		LocalEnvVar: "DEV_LOCAL_GCAL_KEY_PATH",
		WindmillPath: windmillPath,
		Description: "Google Calendar Service Account",
	}
}

// NewTelegramResolver creates a new SecretResolver for Telegram bot token
func NewTelegramResolver(windmillPath string) *SecretResolver {
	return &SecretResolver{
		LocalEnvVar: "DEV_LOCAL_TELEGRAM_TOKEN_PATH",
		WindmillPath: windmillPath,
		Description: "Telegram Bot Token",
	}
}

// NewGmailResolver creates a new SecretResolver for Gmail credentials
func NewGmailResolver(windmillPath string) *SecretResolver {
	return &SecretResolver{
		LocalEnvVar: "DEV_LOCAL_GMAIL_CREDENTIALS_PATH",
		WindmillPath: windmillPath,
		Description: "Gmail OAuth Credentials",
	}
}

// NewDBResolver creates a new SecretResolver for database connection string
func NewDBResolver(windmillPath string) *SecretResolver {
	return &SecretResolver{
		LocalEnvVar: "DEV_LOCAL_DB_URL_PATH",
		WindmillPath: windmillPath,
		Description: "Database Connection String",
	}
}
