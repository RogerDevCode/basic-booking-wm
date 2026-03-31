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
	if len(os.Args) < 2 {
		fmt.Println("❌ Uso: go run cleanup_day.go YYYY-MM-DD")
		os.Exit(1)
	}
	dateStr := os.Args[1]

	fmt.Printf("╔══════════════════════════════════════════════════════════╗\n")
	fmt.Printf("║  DRON DE LIMPIEZA DIARIA: %s                 ║\n", dateStr)
	fmt.Printf("╚══════════════════════════════════════════════════════════╝\n")

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
	
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		fmt.Printf("❌ Fecha inválida: %v\n", err)
		os.Exit(1)
	}

	tMin := t.Format(time.RFC3339)
	tMax := t.Add(24 * time.Hour).Format(time.RFC3339)

	fmt.Printf("\n🚀 Escaneando %s...\n", dateStr)
	
	totalProcessed := 0
	totalDeleted := 0
	
	err = svc.Events.List(calendarID).TimeMin(tMin).TimeMax(tMax).SingleEvents(true).Pages(ctx, func(page *calendar.Events) error {
		for _, item := range page.Items {
			totalProcessed++
			
			title := strings.ToLower(item.Summary)
			isGhost := false
			
			// Detect empty or system titles
			if strings.TrimSpace(title) == "" || 
			   strings.Contains(title, "(no title)") || 
			   strings.Contains(title, "no title") || 
			   strings.Contains(title, "no tittle") ||
			   strings.Contains(title, "sin título") ||
			   strings.Contains(title, "reserva") {
				isGhost = true
			}
			
			if isGhost {
				err := svc.Events.Delete(calendarID, item.Id).Do()
				if err != nil {
					fmt.Printf("   ❌ Error en ID %s: %v\n", item.Id, err)
				} else {
					totalDeleted++
				}
			}
		}
		return nil
	})

	if err != nil {
		fmt.Printf("\n❌ Error: %v\n", err)
	}

	fmt.Printf("\n✅ %s: Procesados: %d | Borrados: %d\n", dateStr, totalProcessed, totalDeleted)
}
