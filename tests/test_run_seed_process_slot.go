package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"booking-titanium-wm/f/seed_process_slot"
)

func main() {
	// Provider and Service ID from single provider migration
	providerID := "00000000-0000-0000-0000-000000000001"
	serviceID := "00000000-0000-0000-0000-000000000001"
	
	// Create slot for far future at 10:00
	tomorrow := time.Now().Add(90 * 24 * time.Hour)
	startStr := fmt.Sprintf("%04d-%02d-%02dT10:00:00Z", tomorrow.Year(), tomorrow.Month(), tomorrow.Day())
	endStr := fmt.Sprintf("%04d-%02d-%02dT11:00:00Z", tomorrow.Year(), tomorrow.Month(), tomorrow.Day())

	req := inner.SeedSlotRequest{
		ProviderID:      providerID,
		ServiceID:       serviceID,
		StartTime:       startStr,
		EndTime:         endStr,
		ChatID:          "5391760292",
		IdempotencyKey:  fmt.Sprintf("SEED-%s-%d", startStr, time.Now().Unix()),
		DurationMinutes: 60,
		Source:          "MANUAL_TEST",
	}

	fmt.Println("Running Seed Process Slot...")
	fmt.Printf("StartTime: %s\n", startStr)

	// Set required ENV
	os.Setenv("DATABASE_URL", "postgresql://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require")


	result, err := inner.Main(req)
	if err != nil {
		fmt.Printf("Error running seed: %v\n", err)
		os.Exit(1)
	}

	jsonBytes, _ := json.MarshalIndent(result, "", "  ")
	fmt.Printf("Result:\n%s\n", string(jsonBytes))
	
	if result.Success {
		fmt.Println("Booking generated successfully!")
	} else {
		fmt.Println("Failed to generate booking.")
	}
}
