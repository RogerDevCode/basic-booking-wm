package rag

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"booking-titanium-wm/pkg/types"
	"booking-titanium-wm/pkg/utils"
)

func proxyToN8N(webhookURL string, payload map[string]interface{}) types.StandardContractResponse[map[string]any] {
	source := "RAG"
	version := "1.0.0"

	payloadBytes, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", webhookURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			"Failed to create request",
			source,
			"rag-proxy",
			version,
		)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			"Webhook execution encountered an error: "+err.Error(),
			source,
			"rag-proxy",
			version,
		)
	}
	defer resp.Body.Close()

	var result types.StandardContractResponse[map[string]any]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return utils.ErrorResponse[map[string]any](
			types.ErrorCodeInternalError,
			"Webhook execution encountered an error: failed to unmarshal response: "+err.Error(),
			source,
			"rag-proxy",
			version,
		)
	}

	return result
}

// HandleIngest maneja la validación e ingestión de documentos RAG
func HandleIngest(payload map[string]interface{}) types.StandardContractResponse[map[string]any] {
	source := "RAG_Ingest"
	workflowID := "rag-ingest-v1"
	version := "1.0.0"

	// Validate provider_id
	if _, ok := payload["provider_id"]; !ok {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Missing provider_id", source, workflowID, version)
	}
	
	switch payload["provider_id"].(type) {
	case float64, int, int64:
		// valid
	default:
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Invalid provider_id type", source, workflowID, version)
	}

	// Validate title
	titleRaw, ok := payload["title"]
	if !ok {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Missing title", source, workflowID, version)
	}
	title, ok := titleRaw.(string)
	if !ok || len(title) < 3 {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Title too short", source, workflowID, version)
	}
	if len(title) > 200 {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Title too long", source, workflowID, version)
	}

	// Validate content
	contentRaw, ok := payload["content"]
	if !ok {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Missing content", source, workflowID, version)
	}
	content, ok := contentRaw.(string)
	if !ok || len(content) < 10 {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Content too short", source, workflowID, version)
	}

	// Validate status if present
	if statusRaw, ok := payload["status"]; ok {
		status, ok := statusRaw.(string)
		if !ok || (status != "draft" && status != "published" && status != "archived") {
			return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Invalid status enum", source, workflowID, version)
		}
	}

	webhookURL := os.Getenv("N8N_WEBHOOK_URL_RAG_INGEST")
	if webhookURL == "" {
		webhookURL = "http://localhost:5678/webhook/rag-ingest"
	}

	return proxyToN8N(webhookURL, payload)
}

// HandleSearch maneja la búsqueda RAG
func HandleSearch(payload map[string]interface{}) types.StandardContractResponse[map[string]any] {
	source := "RAG_Search"
	workflowID := "rag-search-v1"
	version := "1.0.0"

	// Validate query
	queryRaw, ok := payload["query"]
	if !ok {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Missing query", source, workflowID, version)
	}
	query, ok := queryRaw.(string)
	if !ok || len(query) < 2 {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Query too short", source, workflowID, version)
	}

	// Validate provider_id
	if _, ok := payload["provider_id"]; !ok {
		return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Missing provider_id", source, workflowID, version)
	}

	// Validate limit
	if limitRaw, ok := payload["limit"]; ok {
		var limit float64
		switch v := limitRaw.(type) {
		case float64:
			limit = v
		case int:
			limit = float64(v)
		default:
			return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Invalid limit type", source, workflowID, version)
		}
		if limit < 1 || limit > 20 {
			return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Invalid limit", source, workflowID, version)
		}
	}

	// Validate similarity_threshold
	if simRaw, ok := payload["similarity_threshold"]; ok {
		var threshold float64
		switch v := simRaw.(type) {
		case float64:
			threshold = v
		case int:
			threshold = float64(v)
		default:
			return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Invalid threshold type", source, workflowID, version)
		}
		if threshold < 0 || threshold > 1 {
			return utils.ErrorResponse[map[string]any]("VALIDATION_ERROR", "Invalid threshold", source, workflowID, version)
		}
	}

	webhookURL := os.Getenv("N8N_WEBHOOK_URL_RAG_SEARCH")
	if webhookURL == "" {
		webhookURL = "http://localhost:5678/webhook/rag-search"
	}

	return proxyToN8N(webhookURL, payload)
}
