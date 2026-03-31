package inner

import (
	"context"
	"fmt"
	"time"

	"booking-titanium-wm/pkg/utils"
)

// SeedDailyRequest represents the seed provisioning request
type SeedDailyRequest struct {
	Date            string `json:"date"`              // YYYY-MM-DD
	ProviderID      string `json:"provider_id"`       // UUID
	ServiceID       string `json:"service_id"`        // UUID
	ChatID          string `json:"chat_id"`           // User/chat identifier
	Hours           []int  `json:"hours"`             // Hours to seed [9,10,11,12,13,14,15,16]
	DurationMinutes int    `json:"duration_minutes"`  // Duration of each slot
	TZOffset        string `json:"tz_offset"`         // Timezone offset +HH:MM or -HH:MM
	Source          string `json:"source"`            // Source identifier
}

// SeedDailyResult represents the result of daily seed operation
type SeedDailyResult struct {
	Success       bool                   `json:"success"`
	TotalSlots    int                    `json:"total_slots"`
	Created       int                    `json:"created"`
	Duplicates    int                    `json:"duplicates"`
	Failed        int                    `json:"failed"`
	Unavailable   int                    `json:"unavailable"`
	BookingIDs    []string               `json:"booking_ids,omitempty"`
	Errors        []string               `json:"errors,omitempty"`
	Data          map[string]interface{} `json:"data,omitempty"`
}

// SeedSlotRequest represents a single slot to seed (imported from seed_process_slot)
type SeedSlotRequest struct {
	ProviderID      string `json:"provider_id"`
	ServiceID       string `json:"service_id"`
	StartTime       string `json:"start_time"`
	EndTime         string `json:"end_time"`
	ChatID          string `json:"chat_id"`
	IdempotencyKey  string `json:"idempotency_key"`
	DurationMinutes int    `json:"duration_minutes"`
	Source          string `json:"source"`
}

// SeedSlotResult represents result of single slot processing
type SeedSlotResult struct {
	Success        bool                   `json:"success"`
	BookingID      string                 `json:"booking_id,omitempty"`
	IdempotencyKey string                 `json:"idempotency_key"`
	IsDuplicate    bool                   `json:"is_duplicate"`
	Error          string                 `json:"error,omitempty"`
	Data           map[string]interface{} `json:"data,omitempty"`
}

// main seeds daily booking slots (SEED_01 Daily Provisioning)
// This is the Windmill equivalent of SEED_01_Daily_Provisioning workflow
func Main(req SeedDailyRequest) (SeedDailyResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// Validate input
	validation := validateSeedRequest(req)
	if !validation.Valid {
		return SeedDailyResult{
			Success: false,
			Errors:  []string{validation.Message},
		}, nil
	}

	// Generate slots
	slots := generateSeedSlots(req)
	result := SeedDailyResult{
		TotalSlots: len(slots),
		BookingIDs: make([]string, 0),
		Errors:     make([]string, 0),
		Data: map[string]interface{}{
			"date":        req.Date,
			"provider_id": req.ProviderID,
			"service_id":  req.ServiceID,
			"slot_count":  len(slots),
		},
	}

	// Process each slot
	// Note: In production Windmill flow, this runs in parallel via 'parallel: true'
	for _, slot := range slots {
		slotResult := processSeedSlot(ctx, slot)

		if slotResult.Success {
			result.Created++
			if slotResult.BookingID != "" {
				result.BookingIDs = append(result.BookingIDs, slotResult.BookingID)
			}
			if slotResult.IsDuplicate {
				result.Duplicates++
			}
		} else {
			// Determine failure reason
			if slotResult.Error == "Slot not available" {
				result.Unavailable++
			} else {
				result.Failed++
				result.Errors = append(result.Errors, fmt.Sprintf(
					"Slot %s failed: %s", slot.StartTime, slotResult.Error,
				))
			}
		}
	}

	result.Success = result.Created > 0
	return result, nil
}

// validateSeedRequest validates the seed request
func validateSeedRequest(req SeedDailyRequest) utils.ValidationResult {
	// Date validation
	if req.Date == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "date is required (YYYY-MM-DD)",
		}
	}

	// Validate date format (use ISO datetime validator with dummy time)
	dateValidation := utils.ValidateISODateTime(req.Date+"T00:00:00", "date")
	if !dateValidation.Valid {
		return utils.ValidationResult{
			Valid:   false,
			Error:   dateValidation.Error,
			Message: dateValidation.Message,
		}
	}

	// Provider ID validation
	if req.ProviderID == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "provider_id is required",
		}
	}

	// Validate UUID format
	providerValidation := utils.ValidateUUID(req.ProviderID, "provider_id")
	if !providerValidation.Valid {
		return utils.ValidationResult{
			Valid:   false,
			Error:   providerValidation.Error,
			Message: providerValidation.Message,
		}
	}

	// Service ID validation
	if req.ServiceID == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "service_id is required",
		}
	}

	// Validate UUID format
	serviceValidation := utils.ValidateUUID(req.ServiceID, "service_id")
	if !serviceValidation.Valid {
		return utils.ValidationResult{
			Valid:   false,
			Error:   serviceValidation.Error,
			Message: serviceValidation.Message,
		}
	}

	// Chat ID validation
	if req.ChatID == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "chat_id is required",
		}
	}

	// Hours validation
	if len(req.Hours) == 0 {
		// Default hours if not provided
		req.Hours = []int{9, 10, 11, 12, 13, 14, 15, 16}
	}

	if len(req.Hours) > 24 {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "hours array cannot have more than 24 entries",
		}
	}

	for i, hour := range req.Hours {
		if hour < 0 || hour > 23 {
			return utils.ValidationResult{
				Valid:   false,
				Error:   "INVALID_INPUT",
				Message: fmt.Sprintf("hour at index %d must be 0-23", i),
			}
		}
	}

	// Duration validation
	if req.DurationMinutes < 15 || req.DurationMinutes > 480 {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "duration_minutes must be 15-480",
		}
	}

	// Timezone validation
	if req.TZOffset == "" {
		req.TZOffset = "-03:00" // Default
	}

	tzValidation := validateTZOffset(req.TZOffset)
	if !tzValidation.Valid {
		return utils.ValidationResult{
			Valid:   false,
			Error:   tzValidation.Error,
			Message: tzValidation.Message,
		}
	}

	return utils.ValidationResult{Valid: true}
}

// generateSeedSlots generates seed slots from the request
func generateSeedSlots(req SeedDailyRequest) []SeedSlotRequest {
	slots := make([]SeedSlotRequest, 0, len(req.Hours))

	for _, hour := range req.Hours {
		h := fmt.Sprintf("%02d", hour)
		hNext := fmt.Sprintf("%02d", hour+1)

		idempotencyKey := fmt.Sprintf(
			"SEED-%s-P%s-S%s-%s00",
			req.Date, req.ProviderID, req.ServiceID, h,
		)

		slot := SeedSlotRequest{
			ProviderID:      req.ProviderID,
			ServiceID:       req.ServiceID,
			StartTime:       fmt.Sprintf("%sT%s:00:00%s", req.Date, h, req.TZOffset),
			EndTime:         fmt.Sprintf("%sT%s:00:00%s", req.Date, hNext, req.TZOffset),
			ChatID:          req.ChatID,
			IdempotencyKey:  idempotencyKey,
			DurationMinutes: req.DurationMinutes,
			Source:          req.Source,
		}

		slots = append(slots, slot)
	}

	return slots
}

// processSeedSlot processes a single seed slot
// This would call the seed_process_slot script in Windmill flow
func processSeedSlot(ctx context.Context, slot SeedSlotRequest) SeedSlotResult {
	// In Windmill flow, this calls f/seed_process_slot
	// For now, we'll return a placeholder result
	// In production, use windmill.RunScript or similar
	
	// Validate slot
	validation := validateSeedSlot(slot)
	if !validation.Valid {
		return SeedSlotResult{
			Success:        false,
			IdempotencyKey: slot.IdempotencyKey,
			Error:          validation.Message,
		}
	}

	// Placeholder result (actual implementation calls seed_process_slot script)
	return SeedSlotResult{
		Success:        true,
		BookingID:      "generated-id",
		IdempotencyKey: slot.IdempotencyKey,
		IsDuplicate:    false,
		Data: map[string]interface{}{
			"gcal_synced": true,
		},
	}
}

// validateSeedSlot validates individual slot
func validateSeedSlot(slot SeedSlotRequest) utils.ValidationResult {
	if slot.ProviderID == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "provider_id is required",
		}
	}

	if slot.ServiceID == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "service_id is required",
		}
	}

	if slot.StartTime == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "start_time is required",
		}
	}

	timeValidation := utils.ValidateISODateTime(slot.StartTime, "start_time")
	if !timeValidation.Valid {
		return utils.ValidationResult{
			Valid:   false,
			Error:   timeValidation.Error,
			Message: timeValidation.Message,
		}
	}

	if slot.IdempotencyKey == "" {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "idempotency_key is required",
		}
	}

	return utils.ValidationResult{Valid: true}
}

// validateTZOffset validates timezone offset format
func validateTZOffset(offset string) utils.ValidationResult {
	if len(offset) != 6 {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "tz_offset must be +HH:MM or -HH:MM",
		}
	}

	sign := offset[0]
	if sign != '+' && sign != '-' {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "tz_offset must start with + or -",
		}
	}

	if offset[3] != ':' {
		return utils.ValidationResult{
			Valid:   false,
			Error:   "INVALID_INPUT",
			Message: "tz_offset must have : at position 4",
		}
	}

	return utils.ValidationResult{Valid: true}
}
