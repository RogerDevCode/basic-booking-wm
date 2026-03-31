package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
)

func main() {
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

	calendarID := "dev.n8n.stax@gmail.com"
	
	fmt.Printf("🔍 Escaneando con feedback inmediato...\n")
	
	// List only 10 events to see if it even connects
	events, err := svc.Events.List(calendarID).MaxResults(10).Do()
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}
	
	fmt.Printf("✅ Conexión exitosa! Primeros 10 eventos:\n")
	for _, item := range events.Items {
		date := item.Start.DateTime
		if date == "" {
			date = item.Start.Date
		}
		fmt.Printf("   - [%s] '%s' (ID: %s)\n", date, item.Summary, item.Id)
	}
}
