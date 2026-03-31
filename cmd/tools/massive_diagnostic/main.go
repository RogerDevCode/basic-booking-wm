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
	fmt.Println("║  DRON DE BÚSQUEDA MASIVA v3 (Sin filtros de tiempo)     ║")
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

	calendarIDs := []string{"primary", config.GetGCalCalendarID()}
	
	for _, calID := range calendarIDs {
		fmt.Printf("\n🔍 Investigando Calendario: %s\n", calID)
		
		// Search specifically for "(No title)" and variants
		queries := []string{"(No title)", "(no title)", "no title", "no tittle"}
		
		for _, q := range queries {
			fmt.Printf("   Buscando query: '%s'...\n", q)
			listCall := svc.Events.List(calID).Q(q).MaxResults(2500)
			
			totalFound := 0
			for {
				events, err := listCall.Do()
				if err != nil {
					fmt.Printf("      ❌ Error: %v\n", err)
					break
				}
				totalFound += len(events.Items)
				if events.NextPageToken == "" {
					break
				}
				listCall.PageToken(events.NextPageToken)
			}
			fmt.Printf("      Encontrados: %d\n", totalFound)
		}
		
		// Final check: List ALL events in a 10 year range just to be insane
		fmt.Printf("   Buscando todo en rango de 10 años...\n")
		tMin := time.Now().AddDate(-5, 0, 0).Format(time.RFC3339)
		tMax := time.Now().AddDate(5, 0, 0).Format(time.RFC3339)
		
		allCount := 0
		err := svc.Events.List(calID).TimeMin(tMin).TimeMax(tMax).SingleEvents(true).Pages(ctx, func(page *calendar.Events) error {
			allCount += len(page.Items)
			return nil
		})
		if err != nil {
			fmt.Printf("      ❌ Error: %v\n", err)
		}
		fmt.Printf("      Total absoluto de eventos: %d\n", allCount)
	}
}
