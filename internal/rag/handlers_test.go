package rag

import (
	"os"
	"strings"
	"testing"
)

func TestHandleIngest_Validation(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]interface{}
	}{
		{"rejects missing provider_id", map[string]interface{}{"title": "No Provider ID", "content": "Missing provider_id."}},
		{"rejects invalid provider_id type", map[string]interface{}{"provider_id": "not_a_number", "title": "Invalid Provider", "content": "provider_id is string."}},
		{"rejects missing title", map[string]interface{}{"provider_id": 1, "content": "Document without a title."}},
		{"rejects title too short", map[string]interface{}{"provider_id": 1, "title": "AB", "content": "Title too short."}},
		{"rejects title too long", map[string]interface{}{"provider_id": 1, "title": strings.Repeat("A", 201), "content": "Title too long."}},
		{"rejects missing content", map[string]interface{}{"provider_id": 1, "title": "Missing Content Test"}},
		{"rejects content too short", map[string]interface{}{"provider_id": 1, "title": "Short Content Test", "content": "Short"}},
		{"rejects invalid status enum", map[string]interface{}{"provider_id": 1, "title": "Invalid Status", "content": "Valid content", "status": "active_not_valid"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res := HandleIngest(tc.payload)
			if res.Success {
				t.Errorf("Expected validation to fail for %s", tc.name)
			}
			if *res.ErrorCode != "VALIDATION_ERROR" {
				t.Errorf("Expected VALIDATION_ERROR, got %s", *res.ErrorCode)
			}
		})
	}
}

func TestHandleSearch_Validation(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]interface{}
	}{
		{"rejects missing provider_id", map[string]interface{}{"query": "test query search"}},
		{"rejects missing query", map[string]interface{}{"provider_id": 1}},
		{"rejects query too short", map[string]interface{}{"provider_id": 1, "query": "a"}},
		{"rejects invalid limit type", map[string]interface{}{"provider_id": 1, "query": "test", "limit": "five"}},
		{"rejects invalid limit below 1", map[string]interface{}{"provider_id": 1, "query": "test", "limit": 0}},
		{"rejects invalid limit above 20", map[string]interface{}{"provider_id": 1, "query": "test", "limit": 25}},
		{"rejects invalid similarity type", map[string]interface{}{"provider_id": 1, "query": "test", "similarity_threshold": "high"}},
		{"rejects invalid similarity below 0", map[string]interface{}{"provider_id": 1, "query": "test", "similarity_threshold": -0.5}},
		{"rejects invalid similarity above 1", map[string]interface{}{"provider_id": 1, "query": "test", "similarity_threshold": 1.5}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res := HandleSearch(tc.payload)
			if res.Success {
				t.Errorf("Expected validation to fail for %s", tc.name)
			}
			if *res.ErrorCode != "VALIDATION_ERROR" {
				t.Errorf("Expected VALIDATION_ERROR, got %s", *res.ErrorCode)
			}
		})
	}
}

func TestHandleIngest_Success_Proxy_Network_Fail(t *testing.T) {
	// Force a dead port to ensure it fails at the HTTP client dial stage, proving it passed validation cleanly.
	os.Setenv("N8N_WEBHOOK_URL_RAG_INGEST", "http://localhost:1111/dead-webhook")
	defer os.Unsetenv("N8N_WEBHOOK_URL_RAG_INGEST")

	res := HandleIngest(map[string]interface{}{
		"provider_id": 1,
		"title":       "Test Document Go RAG01",
		"content":     "This is a test document for Go RAG_01 ingestion testing.",
		"source_type": "faq",
		"status":      "published",
		"language":    "es",
	})
	
	if res.Success {
		t.Fatalf("Expected failure due to dead webhook port, got success instead")
	}

	if res.ErrorCode == nil {
		t.Fatalf("Expected ErrorCode but got nil")
	}

	if *res.ErrorCode == "VALIDATION_ERROR" {
		t.Errorf("Expected to pass validation but failed: %s", *res.ErrorMessage)
	}
}

func TestHandleSearch_Success_Proxy_Network_Fail(t *testing.T) {
	os.Setenv("N8N_WEBHOOK_URL_RAG_SEARCH", "http://localhost:1111/dead-webhook")
	defer os.Unsetenv("N8N_WEBHOOK_URL_RAG_SEARCH")
	
	res := HandleSearch(map[string]interface{}{
		"provider_id": 1,
		"query":       "Valid search RAG",
		"limit":       5,
	})
	
	if res.Success {
		t.Fatalf("Expected failure due to dead webhook port, got success instead")
	}

	if res.ErrorCode == nil {
		t.Fatalf("Expected ErrorCode but got nil")
	}

	if *res.ErrorCode == "VALIDATION_ERROR" {
		t.Errorf("Expected to pass validation but failed: %s", *res.ErrorMessage)
	}
}
