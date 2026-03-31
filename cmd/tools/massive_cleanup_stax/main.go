package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"

	"booking-titanium-wm/internal/core/config"
	"booking-titanium-wm/internal/core/db"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  DRON DE LIMPIEZA FINAL (ALTO VOLUMEN + RESERVAS)     ║")
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
	tMin := time.Now().AddDate(-1, 0, 0).Format(time.RFC3339)
	tMax := time.Now().AddDate(+1, 0, 0).Format(time.RFC3339)

	fmt.Printf("\n🚀 Iniciando BARRIDO FINAL en '%s'...\n", calendarID)
	
	// Worker Pool setup
	workerCount := 10 // Parallel deletions
	jobs := make(chan string, 10000)
	var wg sync.WaitGroup
	var deletedCount int64

	// Start Workers
	for w := 1; w <= workerCount; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for eventID := range jobs {
				err := svc.Events.Delete(calendarID, eventID).Do()
				if err != nil {
					// Ignore errors (e.g. 404 if already deleted)
				} else {
					newVal := atomic.AddInt64(&deletedCount, 1)
					if newVal%50 == 0 {
						fmt.Printf("   🗑️ Total Borrados: %d...\n", newVal)
					}
				}
				time.Sleep(50 * time.Millisecond) // Protective delay
			}
		}(w)
	}

	// Producer: List and identify ghosts + "reserva"
	totalProcessed := 0
	listCall := svc.Events.List(calendarID).TimeMin(tMin).TimeMax(tMax).MaxResults(2500).SingleEvents(true)
	
	for {
		events, err := listCall.Do()
		if err != nil {
			fmt.Printf("\n❌ Error listando: %v\n", err)
			break
		}
		
		fmt.Printf("   📥 Analizando página de %d eventos...\n", len(events.Items))
		
		for _, item := range events.Items {
			totalProcessed++
			
			title := strings.ToLower(item.Summary)
			isGhost := false
			
			// Criteria 1: Empty or (No title)
			if strings.TrimSpace(title) == "" || 
			   strings.Contains(title, "(no title)") || 
			   strings.Contains(title, "no title") || 
			   strings.Contains(title, "no tittle") ||
			   strings.Contains(title, "sin título") {
				isGhost = true
			}
			
			// Criteria 2: "reserva" (User explicit request)
			if strings.Contains(title, "reserva") {
				isGhost = true
			}
			
			if isGhost {
				jobs <- item.Id
			}
		}
		
		if events.NextPageToken == "" {
			break
		}
		listCall.PageToken(events.NextPageToken)
	}

	close(jobs)
	wg.Wait()

	fmt.Printf("\n✅ BARRIDO FINAL COMPLETADO! 🏁\n")
	fmt.Printf("   Total Analizados: %d\n", totalProcessed)
	fmt.Printf("   Total Borrados:   %d\n", deletedCount)
}
