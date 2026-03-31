package main

import (
	"fmt"
	"os"
	"time"

	"booking-titanium-wm/internal/booking"
)

func main() {
	// Test booking for tomorrow at 10 AM
	tomorrow := time.Now().AddDate(0, 0, 1)
	startTime := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 10, 0, 0, 0, tomorrow.Location())
	
	// Single provider/service IDs from config
	providerID := 1  // Will be overridden by config in single-provider mode
	serviceID := 1
	chatID := "5391760292"
	userName := "Test User"
	userEmail := "test@example.com"
	gcalEventID := ""

	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println("  TEST BOOKING EXECUTION")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("Date: %s\n", tomorrow.Format("2006-01-02"))
	fmt.Printf("Time: %s\n", startTime.Format("15:04:05"))
	fmt.Printf("Provider ID: %d\n", providerID)
	fmt.Printf("Service ID: %d\n", serviceID)
	fmt.Printf("Chat ID: %s\n", chatID)
	fmt.Printf("User: %s <%s>\n", userName, userEmail)
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println()

	// Execute booking
	// Single provider/service UUIDs
	providerUUID := "00000000-0000-0000-0000-000000000001"
	serviceUUID := "00000000-0000-0000-0000-000000000001"

	response := booking.CreateBooking(
		providerUUID,
		serviceUUID,
		startTime.Format(time.RFC3339),
		chatID,
		userName,
		userEmail,
		gcalEventID,
	)

	fmt.Println("RESULT:")
	fmt.Printf("  Success: %v\n", response.Success)
	if response.Success {
		if response.Data != nil {
			data := *response.Data
			fmt.Printf("  Booking ID: %v\n", data["id"])
			fmt.Printf("  Status: %v\n", data["status"])
			fmt.Printf("  Is Duplicate: %v\n", data["is_duplicate"])
			fmt.Printf("  Start Time: %v\n", data["start_time"])
		}
	} else {
		if response.ErrorMessage != nil {
			fmt.Printf("  Error: %s\n", *response.ErrorMessage)
		}
		if response.ErrorCode != nil {
			fmt.Printf("  Error Code: %s\n", *response.ErrorCode)
		}
	}
	fmt.Println()

	if response.Success {
		fmt.Println("✅ TEST PASSED - Booking created successfully!")
		os.Exit(0)
	} else {
		fmt.Println("❌ TEST FAILED - Booking creation failed")
		os.Exit(1)
	}
}
