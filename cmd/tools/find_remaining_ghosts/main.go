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
	tMin := time.Now().AddDate(-1, 0, 0).Format(time.RFC3339)
	tMax := time.Now().AddDate(+1, 0, 0).Format(time.RFC3339)

	fmt.Printf("🔍 Escaneando 'dev.n8n.stax@gmail.com' en busca de fantasmas y 'reserva'...\n")

	count := 0
	err := svc.Events.List(calendarID).TimeMin(tMin).TimeMax(tMax).SingleEvents(true).Pages(ctx, func(page *calendar.Events) error {
		for _, item := range page.Items {
			title := strings.ToLower(item.Summary)
			if strings.TrimSpace(title) == "" || strings.Contains(title, "reserva") || strings.Contains(title, "no title") {
				date := item.Start.DateTime
				if date == "" { date = item.Start.Date }
				fmt.Printf("   📌 [%s] '%s' (ID: %s)\n", date, item.Summary, item.Id)
				count++
				if count >= 20 { return fmt.Errorf("limit_reached") }
			}
		}
		return nil
	})

	if err != nil && err.Error() != "limit_reached" {
		fmt.Printf("❌ Error: %v\n", err)
	}
	
	if count == 0 {
		fmt.Printf("✅ No se encontraron eventos que coincidan con los criterios de limpieza.\n")
	}
}
