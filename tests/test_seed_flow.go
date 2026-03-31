package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"booking-titanium-wm/f/seed_daily_provisioning"
)

func main() {
	// Test seed for tomorrow at 10 AM
	tomorrow := time.Now().AddDate(0, 0, 1)
	dateStr := tomorrow.Format("2006-01-02")
	
	req := inner.SeedDailyRequest{
		Date:            dateStr,
		ProviderID:      "00000000-0000-0000-0000-000000000001",
		ServiceID:       "00000000-0000-0000-0000-000000000001",
		ChatID:          "5391760292",
		Hours:           []int{10, 11, 12}, // Seed 3 slots
		DurationMinutes: 60,
		TZOffset:        "-03:00",
		Source:          "TEST_SEED",
	}

	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println("  SEED DAILY PROVISIONING - TEST")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("Date: %s\n", req.Date)
	fmt.Printf("Provider: %s\n", req.ProviderID)
	fmt.Printf("Service: %s\n", req.ServiceID)
	fmt.Printf("Hours: %v\n", req.Hours)
	fmt.Printf("Duration: %d min\n", req.DurationMinutes)
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println()

	// Execute seed
	_, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// Set DB URL
	os.Setenv("DATABASE_URL", os.Getenv("NEON_DATABASE_URL"))

	result, err := inner.Main(req)
	if err != nil {
		fmt.Printf("❌ SEED FAILED: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("SEED RESULT:")
	fmt.Printf("  Success: %v\n", result.Success)
	fmt.Printf("  Total Slots: %d\n", result.TotalSlots)
	fmt.Printf("  Created: %d\n", result.Created)
	fmt.Printf("  Duplicates: %d\n", result.Duplicates)
	fmt.Printf("  Failed: %d\n", result.Failed)
	fmt.Printf("  Unavailable: %d\n", result.Unavailable)
	
	if len(result.BookingIDs) > 0 {
		fmt.Printf("  Booking IDs: %v\n", result.BookingIDs)
	}
	
	if len(result.Errors) > 0 {
		fmt.Printf("  Errors: %v\n", result.Errors)
	}
	fmt.Println()

	if result.Success {
		fmt.Println("✅ SEED TEST PASSED!")
		os.Exit(0)
	} else {
		fmt.Println("❌ SEED TEST FAILED")
		os.Exit(1)
	}
}
