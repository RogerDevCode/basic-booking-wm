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
	fmt.Println("║  DRON DE BÚSQUEDA ESPECÍFICO (dev.n8n.stax@gmail.com)    ║")
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

	targetCal := "dev.n8n.stax@gmail.com"
	
	fmt.Printf("\n🔍 Probando acceso a: %s\n", targetCal)
	
	tMin := time.Now().AddDate(-1, 0, 0).Format(time.RFC3339)
	tMax := time.Now().AddDate(1, 0, 0).Format(time.RFC3339)
	
	count := 0
	noTitleCount := 0
	
	err := svc.Events.List(targetCal).TimeMin(tMin).TimeMax(tMax).Pages(ctx, func(page *calendar.Events) error {
		count += len(page.Items)
		for _, it := range page.Items {
			if it.Summary == "" || it.Summary == "(No title)" || it.Summary == "(no title)" {
				noTitleCount++
			}
		}
		return nil
	})
	
	if err != nil {
		fmt.Printf("❌ No se pudo acceder al calendario: %v\n", err)
		fmt.Printf("   ⚠️ Esto confirma que el usuario DEBE compartir el calendario con el Service Account.\n")
		return
	}
	
	fmt.Printf("✅ Acceso exitoso!\n")
	fmt.Printf("   Total Eventos: %d\n", count)
	fmt.Printf("   Sin Título:    %d\n", noTitleCount)
}
