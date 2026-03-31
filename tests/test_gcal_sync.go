package main

import (
	"context"
	"encoding/json"
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
	// Booking details
	bookingID := "c0ae2e14-8a1a-4ecf-84ef-3557d7d1b345"
	startTime := "2026-03-30T10:00:00-03:00"
	endTime := "2026-03-30T11:00:00-03:00"
	title := "Cita Médica - Test Booking"
	description := "Test booking created via CLI"
	calendarID := "primary"

	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println("  GCAL SYNC - TEST BOOKING")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("Booking ID: %s\n", bookingID)
	fmt.Printf("Start: %s\n", startTime)
	fmt.Printf("End: %s\n", endTime)
	fmt.Printf("Title: %s\n", title)
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println()

	// Load credentials
	credsPath := os.Getenv("GCAL_CREDENTIALS_PATH")
	if credsPath == "" {
		homeDir, _ := os.UserHomeDir()
		credsPath = filepath.Join(homeDir, ".secrets_wm", "booking-sa-key.json")
	}

	fmt.Printf("Loading credentials from: %s\n", credsPath)
	credsJSON, err := ioutil.ReadFile(credsPath)
	if err != nil {
		fmt.Printf("❌ Failed to read credentials: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✅ Credentials loaded")

	// Create context
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Create credentials
	creds, err := google.CredentialsFromJSON(ctx, credsJSON, calendar.CalendarScope)
	if err != nil {
		fmt.Printf("❌ Failed to parse credentials: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✅ Credentials parsed")

	// Create Calendar service
	srv, err := calendar.NewService(ctx, option.WithCredentials(creds))
	if err != nil {
		fmt.Printf("❌ Failed to create Calendar service: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✅ Calendar service created")

	// Create event
	event := &calendar.Event{
		Summary:     title,
		Description: description,
		Start: &calendar.EventDateTime{
			DateTime: startTime,
			TimeZone: "America/Argentina/Buenos_Aires",
		},
		End: &calendar.EventDateTime{
			DateTime: endTime,
			TimeZone: "America/Argentina/Buenos_Aires",
		},
	}

	fmt.Println()
	fmt.Println("Creating GCal event...")
	createdEvent, err := srv.Events.Insert(calendarID, event).Do()
	if err != nil {
		fmt.Printf("❌ Failed to create event: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Event created successfully!")
	fmt.Println()
	fmt.Println("EVENT DETAILS:")
	fmt.Printf("  Event ID: %s\n", createdEvent.Id)
	fmt.Printf("  Summary: %s\n", createdEvent.Summary)
	fmt.Printf("  Start: %s\n", createdEvent.Start.DateTime)
	fmt.Printf("  End: %s\n", createdEvent.End.DateTime)
	fmt.Printf("  HTML Link: %s\n", createdEvent.HtmlLink)
	fmt.Println()

	// Save event ID for DB update
	eventJSON, _ := json.Marshal(map[string]string{
		"event_id":   createdEvent.Id,
		"html_link":  createdEvent.HtmlLink,
		"status":     "success",
	})
	fmt.Printf("Event JSON: %s\n", string(eventJSON))
	fmt.Println()
	fmt.Println("✅ GCAL SYNC COMPLETE!")
}
