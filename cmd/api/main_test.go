package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"booking-titanium-wm/pkg/types"
)

// TestBookingGateway_MissingAction tests validation of missing required fields
func TestBookingGateway_MissingAction(t *testing.T) {
	// Empty payload
	payload := []byte(`{}`)
	req, err := http.NewRequest("POST", "/book-appointment", bytes.NewBuffer(payload))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(bookingGatewayHandler)

	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
	}

	var response types.StandardContractResponse[map[string]any]
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.Success {
		t.Errorf("Expected success=false for missing action")
	}

	if response.ErrorCode == nil || *response.ErrorCode != "INVALID_ACTION" {
		t.Errorf("Expected error_code INVALID_ACTION to be defined, got %v", response.ErrorCode)
	}
}

// TestBookingGateway_StandardContract tests Standard Contract response format directly on unknown actions
func TestBookingGateway_StandardContract(t *testing.T) {
	payload := []byte(`{
		"provider_id": 1,
		"service_id":  1,
		"start_time":  "2026-04-15T10:00:00-03:00",
		"chat_id":     "123456"
	}`)
	req, err := http.NewRequest("POST", "/book-appointment", bytes.NewBuffer(payload))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(bookingGatewayHandler)

	handler.ServeHTTP(rr, req)

	var response types.StandardContractResponse[map[string]any]
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.Meta.Source == "" {
		t.Errorf("Expected _meta.source to be defined")
	}

	if response.Meta.Timestamp == "" {
		t.Errorf("Expected _meta.timestamp to be defined")
	}

	_, err = time.Parse(time.RFC3339, response.Meta.Timestamp)
	if err != nil {
		t.Errorf("Expected _meta.timestamp to be a valid RFC3339 string: %v", err)
	}
}

// TestBookingGateway_InvalidJSON tests handling of malformed requests
func TestBookingGateway_InvalidJSON(t *testing.T) {
	payload := []byte(`{ invalid json... }`)
	req, err := http.NewRequest("POST", "/book-appointment", bytes.NewBuffer(payload))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(bookingGatewayHandler)

	handler.ServeHTTP(rr, req)

	// Since decoding fails before router resolution, we expect 400 Bad Request
	if status := rr.Code; status != http.StatusBadRequest {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusBadRequest)
	}
}
