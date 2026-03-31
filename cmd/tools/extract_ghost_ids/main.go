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

	fmt.Printf("GHOST_ID_START\n")

	err := svc.Events.List(calendarID).TimeMin(tMin).TimeMax(tMax).SingleEvents(true).Pages(ctx, func(page *calendar.Events) error {
		for _, item := range page.Items {
			title := strings.ToLower(item.Summary)
			if strings.TrimSpace(title) == "" || 
			   strings.Contains(title, "reserva") || 
			   strings.Contains(title, "no title") || 
			   strings.Contains(title, "sin título") {
				fmt.Printf("%s\n", item.Id)
			}
		}
		return nil
	})

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
	}
	fmt.Printf("GHOST_ID_END\n")
}
