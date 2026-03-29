package main

import (
	"log"
	"time"

	"booking-titanium-wm/internal/ai"
	"booking-titanium-wm/internal/core/db"
)

func main() {
	log.Println("[WORKER] Starting Booking Titanium background worker...")

	// Initialize database
	config := db.GetDefaultConfig()
	if err := db.InitDB(config); err != nil {
		log.Fatalf("[WORKER] Failed to initialize database: %v", err)
	}
	defer db.CloseDB()

	// Simple loop for periodic tasks
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	// Run once at start
	runTasks()

	for {
		select {
		case <-ticker.C:
			runTasks()
		}
	}
}

func runTasks() {
	log.Println("[WORKER] Running periodic tasks...")

	// Run reminders
	resp := ai.ReminderCron()
	if resp.Success {
		log.Printf("[WORKER] Reminder cron completed successfully: %v", resp.Data)
	} else {
		log.Printf("[WORKER] Reminder cron failed: %v", resp.ErrorMessage)
	}
}
