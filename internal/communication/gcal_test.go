package communication

import (
	"testing"
)

func TestCheckCollision_MissingStartTime(t *testing.T) {
	res := CheckCollision("", "2026-04-15T11:00:00-03:00", "")
	
	if res.Success {
		t.Fatalf("Expected failure due to missing start time")
	}
	
	if *res.ErrorCode != "MISSING_FIELD" && *res.ErrorCode != "INVALID_DATETIME" {
		t.Errorf("Expected MISSING_FIELD or INVALID_DATETIME error code, got %s", *res.ErrorCode)
	}
}

func TestCheckCollision_InvalidStartTimeFormat(t *testing.T) {
	res := CheckCollision("invalid_date", "2026-04-15T11:00:00-03:00", "")
	
	if res.Success {
		t.Fatalf("Expected failure due to invalid start time")
	}
}

func TestCheckCollision_MissingEndTimeCalculatedProperly(t *testing.T) {
	// A valid start time but empty end time should calculate automatically within the parser to 1 hr forward.
	// Since credentials are empty, it will gracefully exit with unconfigured tokens safely showing success=true logic passed.
	res := CheckCollision("2026-04-15T10:00:00-03:00", "", "")
	
	if !res.Success {
		t.Fatalf("Expected logic to succeed calculating missing end_time and fail cleanly on unconfigured keys, got err: %s", *res.ErrorMessage)
	}
	
	data := *res.Data
	if data["has_collision"].(bool) {
		t.Errorf("Expected collision check fallback to false without credentials")
	}
	if data["end_time"] != "2026-04-15T11:00:00-03:00" {
		t.Errorf("Expected end time to be calculated +1h from start, got %s", data["end_time"])
	}
}

func TestCheckCollision_InvalidEndTimeFormat(t *testing.T) {
	res := CheckCollision("2026-04-15T10:00:00-03:00", "invalid_format", "")
	
	if res.Success {
		t.Fatalf("Expected failure due to invalid end time parsing")
	}
}

func TestCheckCollision_HappyPath(t *testing.T) {
	res := CheckCollision("2026-04-15T10:00:00-03:00", "2026-04-15T11:00:00-03:00", "")

	if !res.Success {
		t.Fatalf("Expected check collision logic to succeed without failing struct constraints: %s", *res.ErrorMessage)
	}

	data := *res.Data
	if data["end_time"] != "2026-04-15T11:00:00-03:00" {
		t.Errorf("Expected end time formatting to remain consistent across RFC3339 constraints, got %v", data["end_time"])
	}
}

func TestCreateEvent_MissingStartTime(t *testing.T) {
	res := CreateEvent("", "Consultation", "Foo", "")

	if res.Success {
		t.Fatalf("Expected event creation to fail missing start time")
	}
}

func TestCreateEvent_MissingTitle(t *testing.T) {
	res := CreateEvent("2026-04-15T10:00:00-03:00", "", "Foo", "")

	if res.Success {
		t.Fatalf("Expected event creation to fail missing title string")
	}
}

func TestCreateEvent_HappyPathFallback(t *testing.T) {
	res := CreateEvent("2026-04-15T10:00:00-03:00", "Consultation", "Foo", "")

	if !res.Success {
		t.Fatalf("Expected event creation struct boundary execution to succeed without keys: %s", *res.ErrorMessage)
	}

	data := *res.Data
	if data["created"].(bool) {
		t.Errorf("Fallback event execution should yield created=false without live API credentials")
	}
}

func TestDeleteEvent_MissingEventID(t *testing.T) {
	res := DeleteEvent("", "")

	if res.Success {
		t.Fatalf("Expected event rollback to fail instantly without event id")
	}
	
	if *res.ErrorCode != "MISSING_FIELD" {
		t.Errorf("Expected generic MISSING_FIELD, got %s", *res.ErrorCode)
	}
}

func TestDeleteEvent_HappyPathFallback(t *testing.T) {
	res := DeleteEvent("dummy_event_123", "")

	if !res.Success {
		t.Fatalf("Expected Event Deletion to pass structural inputs dynamically")
	}
	
	data := *res.Data
	if data["deleted"].(bool) {
		t.Errorf("Should yield false deleting logic dynamically without active google api permissions")
	}
}
