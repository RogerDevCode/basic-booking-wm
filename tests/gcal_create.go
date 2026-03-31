package main

import (
	"context"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

func main() {
	if len(os.Args) < 5 {
		fmt.Println("Uso: gcal_create <booking_id> <start_time> <end_time> <calendar_id>")
		os.Exit(1)
	}

	bookingID := os.Args[1]
	startTime := os.Args[2]
	endTime := os.Args[3]
	calendarID := os.Args[4]

	homeDir, _ := os.UserHomeDir()
	credsPath := filepath.Join(homeDir, ".secrets_wm", "booking-sa-key.json")
	credsJSON, err := ioutil.ReadFile(credsPath)
	if err != nil {
		fmt.Printf("❌ Creds Error: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	creds, err := google.CredentialsFromJSON(ctx, credsJSON, calendar.CalendarScope)
	if err != nil {
		fmt.Printf("❌ Auth Error: %v\n", err)
		os.Exit(1)
	}

	srv, err := calendar.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		fmt.Printf("❌ Service Error: %v\n", err)
		os.Exit(1)
	}

	event := &calendar.Event{
		Summary:     "Cita Médica - Seed Booking",
		Description: fmt.Sprintf("Booking ID: %s", bookingID),
		Start: &calendar.EventDateTime{
			DateTime: startTime,
			TimeZone: "America/Argentina/Buenos_Aires",
		},
		End: &calendar.EventDateTime{
			DateTime: endTime,
			TimeZone: "America/Argentina/Buenos_Aires",
		},
	}

	createdEvent, err := srv.Events.Insert(calendarID, event).Do()
	if err != nil {
		fmt.Printf("❌ GCal Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✅ GCal Event ID: %s\n", createdEvent.Id)
	fmt.Printf("✅ GCal Link: %s\n", createdEvent.HtmlLink)
	fmt.Printf("GCAL_EVENT_ID=%s\n", createdEvent.Id)
}
