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
	fmt.Println("║  DRON DE DIAGNÓSTICO FINAL (DRY RUN)                    ║")
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

	calendarID := "dev.n8n.stax@gmail.com"
	tMin := time.Now().AddDate(0, 0, -120).Format(time.RFC3339)
	tMax := time.Now().AddDate(0, 0, 120).Format(time.RFC3339)

	fmt.Printf("\n🔍 Escaneando '%s' (+/- 120 días)...\n", calendarID)
	
	totalProcessed := 0
	ghostCount := 0
	reservaCount := 0
	otherCount := 0
	
	err := svc.Events.List(calendarID).TimeMin(tMin).TimeMax(tMax).MaxResults(2500).SingleEvents(true).Pages(ctx, func(page *calendar.Events) error {
		for _, item := range page.Items {
			totalProcessed++
			
			title := strings.ToLower(item.Summary)
			isGhost := false
			isReserva := false
			
			if strings.TrimSpace(title) == "" || 
			   strings.Contains(title, "(no title)") || 
			   strings.Contains(title, "no title") || 
			   strings.Contains(title, "no tittle") ||
			   strings.Contains(title, "sin título") {
				isGhost = true
			}
			
			if strings.Contains(title, "reserva") {
				isReserva = true
			}
			
			if isGhost {
				ghostCount++
			} else if isReserva {
				reservaCount++
			} else {
				otherCount++
			}
			
			if totalProcessed % 500 == 0 {
				fmt.Printf("   👀 Analizados: %d...\n", totalProcessed)
			}
		}
		return nil
	})

	if err != nil {
		fmt.Printf("\n❌ Error: %v\n", err)
	}

	fmt.Printf("\n📊 RESULTADOS DEL DIAGNÓSTICO:\n")
	fmt.Printf("   Total Analizados:  %d\n", totalProcessed)
	fmt.Printf("   Fantasmas (Ghosts): %d\n", ghostCount)
	fmt.Printf("   Titulados 'reserva': %d\n", reservaCount)
	fmt.Printf("   Citas Legítimas:    %d\n", otherCount)
}
