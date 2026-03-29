package go_tests

import (
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"
)

// StandardContractResponse es el formato estándar de respuestas
type StandardContractResponse struct {
	Success      bool            `json:"success"`
	ErrorCode    *string         `json:"error_code,omitempty"`
	ErrorMessage *string         `json:"error_message,omitempty"`
	Data         json.RawMessage `json:"data,omitempty"`
	Meta         ResponseMeta    `json:"_meta"`
}

// ResponseMeta contiene metadata de la respuesta
type ResponseMeta struct {
	Source     string `json:"source"`
	Timestamp  string `json:"timestamp"`
	WorkflowID string `json:"workflow_id,omitempty"`
	Version    string `json:"version,omitempty"`
}

// ConfigResponse representa la respuesta del endpoint de configuración
type ConfigResponse struct {
	N8NEditorBaseURL  string `json:"N8N_EDITOR_BASE_URL"`
	TelegramAdminID   string `json:"TELEGRAM_ADMIN_ID"`
	BusinessEmail     string `json:"BUSINESS_EMAIL"`
	DefaultProviderID int    `json:"DEFAULT_PROVIDER_ID"`
	DefaultServiceID  int    `json:"DEFAULT_SERVICE_ID"`
	DALServiceURL     string `json:"DAL_SERVICE_URL"`
}

// getAPIURL returns the Windmill API URL from env or default
func getAPIURL() string {
	if url := os.Getenv("WINDMILL_API_URL"); url != "" {
		return url
	}
	return "http://localhost:8080"
}

// postRequest makes a POST request to the specified endpoint
func postRequest(endpoint string, payload interface{}) (*StandardContractResponse, int, error) {
	apiURL := getAPIURL()
	url := fmt.Sprintf("%s%s", apiURL, endpoint)

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal payload: %w", err)
	}

	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response: %w", err)
	}

	var response StandardContractResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &response, resp.StatusCode, nil
}

// postRequestWithHeaders makes a POST request to the specified endpoint with custom headers
func postRequestWithHeaders(endpoint string, payload interface{}, headers map[string]string) (*StandardContractResponse, int, error) {
	apiURL := getAPIURL()
	url := fmt.Sprintf("%s%s", apiURL, endpoint)

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", url, strings.NewReader(string(jsonData)))
	if err != nil {
		return nil, 0, fmt.Errorf("request creation failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response: %w", err)
	}

	var response StandardContractResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &response, resp.StatusCode, nil
}

// getConfigResponse makes a POST request and returns typed config response
func getConfigResponse(endpoint string, payload interface{}) (*ConfigResponse, int, error) {
	apiURL := getAPIURL()
	url := fmt.Sprintf("%s%s", apiURL, endpoint)

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal payload: %w", err)
	}

	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response: %w", err)
	}

	var response struct {
		Success bool           `json:"success"`
		Data    ConfigResponse `json:"data"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &response.Data, resp.StatusCode, nil
}

// getRequest makes a GET request to the specified endpoint
func getRequest(endpoint string) (*StandardContractResponse, int, error) {
	apiURL := getAPIURL()
	url := fmt.Sprintf("%s%s", apiURL, endpoint)
	
	resp, err := http.Get(url)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response: %w", err)
	}

	var response StandardContractResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &response, resp.StatusCode, nil
}

// extractData extracts typed data from json.RawMessage
func extractData(raw json.RawMessage, target interface{}) error {
	return json.Unmarshal(raw, target)
}

// extractMapData extracts map[string]interface{} from json.RawMessage
func extractMapData(raw json.RawMessage) (map[string]interface{}, error) {
	var data map[string]interface{}
	err := json.Unmarshal(raw, &data)
	return data, err
}

// randomInt generates a random integer between 0 and max-1
func randomInt(max int) int {
	rand.Seed(time.Now().UnixNano())
	return rand.Intn(max)
}

// containsSubstring checks if a string contains a substring
func containsSubstring(s, substr string) bool {
	return strings.Contains(s, substr)
}
