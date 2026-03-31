package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

func loadEnvManually(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var currentKey string
	var currentValue strings.Builder
	inMultiLine := false

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		if !inMultiLine {
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])

			if strings.HasPrefix(val, "{") || strings.HasPrefix(val, "'{") || strings.HasPrefix(val, "\"{") {
				inMultiLine = true
				currentKey = key
				currentValue.Reset()
				val = strings.TrimPrefix(val, "'")
				val = strings.TrimPrefix(val, "\"")
				currentValue.WriteString(val)
				if strings.HasSuffix(val, "}") {
					inMultiLine = false
					os.Setenv(currentKey, currentValue.String())
				}
			} else {
				os.Setenv(key, strings.Trim(val, "\"'"))
			}
		} else {
			currentValue.WriteString("\n")
			val := strings.TrimSpace(line)
			currentValue.WriteString(val)
			if strings.HasSuffix(val, "}") || strings.HasSuffix(val, "}'") || strings.HasSuffix(val, "}\"") {
				inMultiLine = false
				finalVal := strings.TrimSuffix(currentValue.String(), "'")
				finalVal = strings.TrimSuffix(finalVal, "\"")
				os.Setenv(currentKey, finalVal)
			}
		}
	}
	return scanner.Err()
}

func main() {
	fmt.Println("🚀 Loading environment and running LEAF tests...")
	
	// Try loading from docker-compose/.env if exists
	if _, err := os.Stat("docker-compose/.env"); err == nil {
		loadEnvManually("docker-compose/.env")
	}

	// Mappings
	if os.Getenv("TELEGRAM_BOT_TOKEN") == "" && os.Getenv("TELEGRAM_TOKEN") != "" {
		os.Setenv("TELEGRAM_BOT_TOKEN", os.Getenv("TELEGRAM_TOKEN"))
	}
	if os.Getenv("GMAIL_USERNAME") == "" && os.Getenv("GMAIL_USER") != "" {
		os.Setenv("GMAIL_USERNAME", os.Getenv("GMAIL_USER"))
	}
	if os.Getenv("GMAIL_USERNAME") == "" && os.Getenv("DEV_LOCAL_GMAIL_USER") != "" {
		os.Setenv("GMAIL_USERNAME", os.Getenv("DEV_LOCAL_GMAIL_USER"))
	}
	if os.Getenv("GMAIL_PASSWORD") == "" && os.Getenv("DEV_LOCAL_GMAIL_PASS") != "" {
		os.Setenv("GMAIL_PASSWORD", os.Getenv("DEV_LOCAL_GMAIL_PASS"))
	}

	cmd := exec.Command("go", "test", "-v", "tests/go/leaf_scripts_happy_path_test.go")
	cmd.Env = os.Environ()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	if err := cmd.Run(); err != nil {
		fmt.Printf("❌ Tests failed: %v\n", err)
		os.Exit(1)
	}
}
