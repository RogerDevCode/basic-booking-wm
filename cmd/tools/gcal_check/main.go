package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

func main() {
	// Load credentials
	localPath := os.Getenv("DEV_LOCAL_GCAL_KEY_PATH")
	if len(localPath) > 0 && localPath[0] == '~' {
		homeDir, _ := os.UserHomeDir()
		localPath = filepath.Join(homeDir, localPath[1:])
	}
	credsJSON, err := os.ReadFile(localPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to read credentials: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	svc, err := calendar.NewService(ctx, option.WithCredentialsJSON(credsJSON))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create service: %v\n", err)
		os.Exit(1)
	}

	// The real calendar ID from the user
	bookingCalID := "4864be701779548592e0962cf7b4478bb145e26b436ab6fb9285a957892b661f@group.calendar.google.com"

	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  GCAL VERIFICATION — Checking both calendars            ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")

	// 1. List all accessible calendars
	fmt.Println("\n── CALENDARIOS ACCESIBLES ──────────────────")
	calList, err := svc.CalendarList.List().Do()
	if err != nil {
		fmt.Printf("❌ Failed to list calendars: %v\n", err)
	} else {
		for _, cal := range calList.Items {
			fmt.Printf("   📅 %s\n      ID: %s\n      Access: %s\n\n", cal.Summary, cal.Id, cal.AccessRole)
		}
	}

	// 2. Check events on PRIMARY calendar for March 31
	fmt.Println("\n── EVENTS ON 'primary' (March 31) ──────────────────")
	listEvents(svc, "primary", "2026-03-31T00:00:00Z", "2026-04-01T00:00:00Z")

	// 3. Check events on Booking Titanium calendar for March 31
	fmt.Printf("\n── EVENTS ON 'Booking Titanium' (March 31) ──────────────────\n")
	fmt.Printf("   Calendar ID: %s\n", bookingCalID)
	listEvents(svc, bookingCalID, "2026-03-31T00:00:00Z", "2026-04-01T00:00:00Z")

	// 4. Check events on Booking Titanium calendar for March 30 (control)
	fmt.Printf("\n── EVENTS ON 'Booking Titanium' (March 30 — control) ──────────────────\n")
	listEvents(svc, bookingCalID, "2026-03-30T00:00:00Z", "2026-03-31T00:00:00Z")
}

func listEvents(svc *calendar.Service, calID, timeMin, timeMax string) {
	events, err := svc.Events.List(calID).
		TimeMin(timeMin).
		TimeMax(timeMax).
		SingleEvents(true).
		OrderBy("startTime").
		Do()

	if err != nil {
		fmt.Printf("   ❌ Error: %v\n", err)
		return
	}

	if len(events.Items) == 0 {
		fmt.Println("   (sin eventos)")
		return
	}

	for _, ev := range events.Items {
		start := ev.Start.DateTime
		if start == "" {
			start = ev.Start.Date
		}
		end := ev.End.DateTime
		if end == "" {
			end = ev.End.Date
		}

		startT, _ := time.Parse(time.RFC3339, start)
		
		fmt.Printf("   🔹 %s → %s | %s\n", startT.Format("15:04"), end, ev.Summary)
		fmt.Printf("      Event ID: %s | Status: %s\n", ev.Id, ev.Status)
	}

	fmt.Printf("   Total: %d eventos\n", len(events.Items))
}
