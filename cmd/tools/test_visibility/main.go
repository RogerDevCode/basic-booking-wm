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

	calID := config.GetGCalCalendarID()
	fmt.Printf("🔍 Probando visibilidad en el ID: %s\n", calID)
	
	// Crear un evento único con un título muy específico
	uniqueTitle := "🔍 TEST_VISIBILIDAD_" + time.Now().Format("150405")
	event := &calendar.Event{
		Summary: uniqueTitle,
		Start: &calendar.EventDateTime{
			DateTime: time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		},
		End: &calendar.EventDateTime{
			DateTime: time.Now().Add(25 * time.Hour).Format(time.RFC3339),
		},
	}
	
	created, err := svc.Events.Insert(calID, event).Do()
	if err != nil {
		fmt.Printf("❌ Error al insertar: %v\n", err)
		return
	}
	
	fmt.Printf("✅ Evento creado: '%s' (ID: %s)\n", uniqueTitle, created.Id)
	fmt.Printf("   Por favor verifica si ves este evento en tu calendario de Google.\n")
}
