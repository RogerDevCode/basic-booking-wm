package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"booking-titanium-wm/internal/communication"
	"booking-titanium-wm/internal/core/db"
	"booking-titanium-wm/pkg/utils"
)

// Seed configuration
const (
	providerID = "00000000-0000-0000-0000-000000000001"
	serviceID  = "00000000-0000-0000-0000-000000000001"
	chatID     = "5391760292" // Test User
	calendarID = "primary"
)

func main() {
	// Target date: 2026-03-31 (pasado mañana)
	targetDate := "2026-03-31"
	tzOffset := "-03:00"
	hours := []int{9, 10, 11, 12, 13, 14, 15, 16}

	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  SEED COMPLETO CON SYNC GCAL — 2026-03-31              ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Initialize DB
	dbConfig := db.GetDefaultConfig()
	if err := db.InitDB(dbConfig); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to connect to DB: %v\n", err)
		os.Exit(1)
	}
	defer db.CloseDB()
	fmt.Println("✅ DB connected")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var created, failed, duplicates int
	var bookingIDs []string

	for _, hour := range hours {
		h := fmt.Sprintf("%02d", hour)
		hEnd := fmt.Sprintf("%02d", hour+1)
		startTime := fmt.Sprintf("%sT%s:00:00%s", targetDate, h, tzOffset)
		endTime := fmt.Sprintf("%sT%s:00:00%s", targetDate, hEnd, tzOffset)

		fmt.Printf("\n── Slot %s:00 local (%s UTC) ──────────────────\n", h, startTimeToUTC(startTime))

		// Generate idempotency key
		idempotencyKey := utils.GenerateIdempotencyKeySingleUUID(serviceID, startTime, chatID)

		// 1. Check if already exists (idempotency)
		existsQuery := `SELECT id, gcal_event_id FROM bookings WHERE idempotency_key = $1 LIMIT 1`
		var existingID string
		var existingGCalID *string
		err := db.GetDB().QueryRowContext(ctx, existsQuery, idempotencyKey).Scan(&existingID, &existingGCalID)
		if err == nil {
			// Booking exists
			gcalStatus := "❌ sin GCal"
			if existingGCalID != nil && *existingGCalID != "" {
				gcalStatus = fmt.Sprintf("✅ GCal: %s", *existingGCalID)
			}
			fmt.Printf("   ⏩ DUPLICADO — ID: %s (%s)\n", existingID, gcalStatus)
			duplicates++
			continue
		}

		// 2. Create GCal event FIRST
		fmt.Printf("   📅 Creando evento GCal... ")
		title := fmt.Sprintf("Reserva Médica — %s %s:00", targetDate, h)
		description := fmt.Sprintf("Proveedor: %s\nServicio: %s\nSeed automático", providerID, serviceID)

		gcalResponse := communication.CreateEvent(startTime, title, description, calendarID)

		if !gcalResponse.Success {
			errMsg := "Unknown error"
			if gcalResponse.ErrorMessage != nil {
				errMsg = *gcalResponse.ErrorMessage
			}
			fmt.Printf("❌ FALLÓ: %s\n", errMsg)
			failed++
			continue
		}

		var gcalEventID string
		if gcalResponse.Data != nil {
			if eventID, ok := (*gcalResponse.Data)["event_id"].(string); ok {
				gcalEventID = eventID
			}
		}

		if gcalEventID == "" {
			fmt.Printf("❌ No event_id returned\n")
			failed++
			continue
		}
		fmt.Printf("✅ %s\n", gcalEventID)

		// 3. Insert booking in DB with gcal_event_id
		fmt.Printf("   💾 Insertando en DB... ")
		insertQuery := `
			INSERT INTO bookings (
				provider_id, service_id, user_id, start_time, end_time,
				gcal_event_id, status, idempotency_key, gcal_synced_at,
				created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, 'confirmed', $7, NOW(), NOW(), NOW()
			)
			RETURNING id`

		var bookingID string
		err = db.GetDB().QueryRowContext(ctx, insertQuery,
			providerID, serviceID, chatID, startTime, endTime,
			gcalEventID, idempotencyKey,
		).Scan(&bookingID)

		if err != nil {
			fmt.Printf("❌ DB error: %v\n", err)
			// Rollback: Delete GCal event
			fmt.Printf("   🔄 Rollback GCal event %s... ", gcalEventID)
			delResp := communication.DeleteEvent(gcalEventID, calendarID)
			if delResp.Success {
				fmt.Printf("✅\n")
			} else {
				fmt.Printf("⚠️ Failed\n")
			}
			failed++
			continue
		}

		fmt.Printf("✅ ID: %s\n", bookingID)
		fmt.Printf("   🔗 SYNC COMPLETO: DB=%s ↔ GCal=%s\n", bookingID, gcalEventID)
		bookingIDs = append(bookingIDs, bookingID)
		created++

		// Small delay to avoid GCal rate limiting
		time.Sleep(500 * time.Millisecond)
	}

	// Summary
	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Printf("║  RESUMEN: %d creados | %d duplicados | %d fallidos       ║\n", created, duplicates, failed)
	fmt.Println("╚══════════════════════════════════════════════════════════╝")
	fmt.Println()

	if len(bookingIDs) > 0 {
		fmt.Println("📋 Booking IDs creados:")
		for i, id := range bookingIDs {
			fmt.Printf("   %d. %s\n", i+1, id)
		}
	}

	// Verification query
	fmt.Println()
	fmt.Println("── VERIFICACIÓN DB ──────────────────────────────────")
	verifyQuery := `
		SELECT id, start_time, end_time, gcal_event_id, status, gcal_synced_at
		FROM bookings
		WHERE start_time >= '2026-03-31' AND start_time < '2026-04-01'
		ORDER BY start_time`

	rows, err := db.GetDB().QueryContext(ctx, verifyQuery)
	if err != nil {
		fmt.Printf("❌ Verification query failed: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	total := 0
	synced := 0
	for rows.Next() {
		var id string
		var startT, endT time.Time
		var gcalID *string
		var status string
		var gcalSynced *time.Time

		if err := rows.Scan(&id, &startT, &endT, &gcalID, &status, &gcalSynced); err != nil {
			fmt.Printf("   ❌ Scan error: %v\n", err)
			continue
		}

		total++
		gcalStr := "❌ NULL"
		if gcalID != nil && *gcalID != "" {
			gcalStr = fmt.Sprintf("✅ %s", *gcalID)
			synced++
		}

		syncStr := "❌ NULL"
		if gcalSynced != nil {
			syncStr = fmt.Sprintf("✅ %s", gcalSynced.Format("15:04:05"))
		}

		fmt.Printf("   %s | %s | %s | GCal: %s | Sync: %s\n",
			id[:8], startT.Format("15:04"), status, gcalStr, syncStr)
	}

	fmt.Printf("\n   Total: %d | Synced: %d | Unsynced: %d\n", total, synced, total-synced)

	if synced == total && total > 0 {
		fmt.Println("\n✅ 100%% SINCRONIZACIÓN DB ↔ GCAL VERIFICADA")
	} else if total > 0 {
		fmt.Printf("\n⚠️  SINCRONIZACIÓN PARCIAL: %d/%d (%.0f%%)\n", synced, total, float64(synced)/float64(total)*100)
	}
}

func startTimeToUTC(isoTime string) string {
	t, err := time.Parse(time.RFC3339, isoTime)
	if err != nil {
		return "?"
	}
	return t.UTC().Format("15:04")
}
