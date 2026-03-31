package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  LIMPIEZA AGRESIVA 'PRIMARY' (Service Account)           ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

	_ = db.InitDB(db.GetDefaultConfig())
	_ = config.Init()

	localPath := os.Getenv("DEV_LOCAL_GCAL_KEY_PATH")
	if len(localPath) > 0 && localPath[0] == '~' {
		homeDir, _ := os.UserHomeDir()
		localPath = filepath.Join(homeDir, localPath[1:])
	}
	credsJSON, _ := os.ReadFile(localPath)

	ctx := context.Background()
	svc, _ := calendar.NewService(ctx, option.WithCredentialsJSON(credsJSON))

	calendarID := "primary"
	tMin := time.Now().AddDate(0, 0, -120).Format(time.RFC3339)
	tMax := time.Now().AddDate(0, 0, 120).Format(time.RFC3339)

	events, err := svc.Events.List(calendarID).TimeMin(tMin).TimeMax(tMax).SingleEvents(true).Do()
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}

	targets := []string{
		"reserva", "appointment", "booking", "tittle", "title",
		"cita", "médica", "medica", "seed", "test", "prueba",
	}
	cleanedCount := 0

	for _, item := range events.Items {
		title := strings.ToLower(item.Summary)
		isTarget := false

		// 1. Check title against list
		for _, t := range targets {
			if strings.Contains(title, t) {
				isTarget = true
				break
			}
		}

		// 2. Check for empty or "(no title)" patterns
		if strings.TrimSpace(title) == "" || 
		   strings.Contains(title, "no title") || 
		   strings.Contains(title, "no tittle") || 
		   strings.Contains(title, "sin título") {
			isTarget = true
		}

		if isTarget {
			fmt.Printf("   🗑️ Borrando de PRIMARY: '%s' [%s]\n", item.Summary, item.Start.DateTime)
			err := svc.Events.Delete(calendarID, item.Id).Do()
			if err != nil {
				fmt.Printf("      ❌ Fallo: %v\n", err)
			} else {
				cleanedCount++
			}
		} else {
			fmt.Printf("   👀 Ignorado (No parece reserva): '%s' [%s]\n", item.Summary, item.Start.DateTime)
		}
	}

	fmt.Printf("\n✅ Limpieza agresiva de PRIMARY finalizada. Borrados: %d\n", cleanedCount)
}
