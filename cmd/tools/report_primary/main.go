package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  REPORTE FINAL DE EVENTOS EN 'PRIMARY'                   ║")
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

	if len(events.Items) == 0 {
		fmt.Println("✅ No se encontraron eventos de ningún tipo en el calendario 'primary'.")
	} else {
		fmt.Printf("⚠️ Se encontraron %d eventos en 'primary'. Listado:\n", len(events.Items))
		for _, item := range events.Items {
			fmt.Printf("   - [%s] '%s' (ID: %s)\n", item.Start.DateTime, item.Summary, item.Id)
		}
	}
}
