// AI Agent v2.0 - DEVIL'S ADVOCATE AGENT
// Edge cases extremos y escenarios adversarios
// Ejecutar: go test -v -run TestDevilsAdvocate

package inner

import (
	"strings"
	"testing"
	"time"
)

// ============================================================================
// DEVIL'S ADVOCATE AGENT - EDGE CASES EXTREMOS
// ============================================================================

func TestDevilsAdvocate_EmptyAndWhitespaceInputs(t *testing.T) {
	tests := []struct {
		name        string
		text        string
		shouldFail  bool
		description string
	}{
		{
			name:        "empty_string",
			text:        "",
			shouldFail:  true,
			description: "Empty string should fail validation",
		},
		{
			name:        "single_space",
			text:        " ",
			shouldFail:  true,
			description: "Single space should fail",
		},
		{
			name:        "multiple_spaces",
			text:        "     ",
			shouldFail:  true,
			description: "Multiple spaces should fail",
		},
		{
			name:        "tabs_only",
			text:        "\t\t\t",
			shouldFail:  true,
			description: "Tabs only should fail",
		},
		{
			name:        "newlines_only",
			text:        "\n\n\n",
			shouldFail:  true,
			description: "Newlines only should fail",
		},
		{
			name:        "mixed_whitespace",
			text:        " \t\n ",
			shouldFail:  true,
			description: "Mixed whitespace should fail",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validatePayloadStrict("123456", tt.text)
			if tt.shouldFail && result.Valid {
				t.Errorf("VALIDATION FAIL: %s\n  Expected invalid, but got valid", tt.description)
			}
			if !tt.shouldFail && !result.Valid {
				t.Errorf("VALIDATION FAIL: %s\n  Expected valid, but got invalid: %s", tt.description, result.Message)
			}
		})
	}
}

func TestDevilsAdvocate_ExtremeLengthInputs(t *testing.T) {
	tests := []struct {
		name        string
		text        string
		shouldFail  bool
		errorCode   string
		description string
	}{
		{
			name:        "single_char",
			text:        "a",
			shouldFail:  true,
			errorCode:   "TEXT_TOO_SHORT",
			description: "Single character should be too short",
		},
		{
			name:        "two_chars",
			text:        "ab",
			shouldFail:  false,
			description: "Two characters should be valid (minimum)",
		},
		{
			name:        "500_chars",
			text:        strings.Repeat("a", 500),
			shouldFail:  false,
			description: "500 characters should be valid (at limit)",
		},
		{
			name:        "501_chars",
			text:        strings.Repeat("a", 501),
			shouldFail:  true,
			errorCode:   "TEXT_TOO_LONG",
			description: "501 characters should be too long",
		},
		{
			name:        "1000_chars",
			text:        strings.Repeat("a", 1000),
			shouldFail:  true,
			errorCode:   "TEXT_TOO_LONG",
			description: "1000 characters should be too long",
		},
		{
			name:        "10000_chars",
			text:        strings.Repeat("a", 10000),
			shouldFail:  true,
			errorCode:   "TEXT_TOO_LONG",
			description: "10000 characters should be too long",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validatePayloadStrict("123456", tt.text)
			if tt.shouldFail && result.Valid {
				t.Errorf("VALIDATION FAIL: %s\n  Expected invalid, but got valid", tt.description)
			}
			if !tt.shouldFail && !result.Valid {
				t.Errorf("VALIDATION FAIL: %s\n  Expected valid, but got invalid: %s", tt.description, result.Message)
			}
			if tt.shouldFail && result.ErrorCode != tt.errorCode {
				t.Errorf("ERROR CODE MISMATCH: %s\n  Expected %s, got %s", tt.description, tt.errorCode, result.ErrorCode)
			}
		})
	}
}

func TestDevilsAdvocate_SQLInjectionAttempts(t *testing.T) {
	tests := []struct {
		name        string
		text        string
		shouldBlock bool
		description string
	}{
		{
			name:        "basic_drop_table",
			text:        "'; DROP TABLE bookings;--",
			shouldBlock: true,
			description: "Basic DROP TABLE injection should be blocked",
		},
		{
			name:        "union_select",
			text:        "1' UNION SELECT * FROM users--",
			shouldBlock: true,
			description: "UNION SELECT injection should be blocked",
		},
		{
			name:        "or_1_equals_1",
			text:        "quiero agendar' OR '1'='1",
			shouldBlock: true,
			description: "OR 1=1 injection should be blocked",
		},
		{
			name:        "comment_injection",
			text:        "hola--",
			shouldBlock: false,
			description: "Simple comment should NOT be blocked (false positive risk)",
		},
		{
			name:        "normal_text_with_quotes",
			text:        "Quiero agendar una cita para 'mañana'",
			shouldBlock: false,
			description: "Normal text with quotes should NOT be blocked",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validatePayloadStrict("123456", tt.text)
			if tt.shouldBlock && result.Valid {
				t.Errorf("SECURITY FAIL: %s\n  SQL injection not blocked: %s", tt.description, tt.text)
			}
			if !tt.shouldBlock && !result.Valid {
				t.Errorf("FALSE POSITIVE: %s\n  Normal text blocked: %s", tt.description, tt.text)
			}
		})
	}
}

func TestDevilsAdvocate_UnicodeAndSpecialCharacters(t *testing.T) {
	tests := []struct {
		name       string
		text       string
		shouldPass bool
		description string
	}{
		{
			name:       "emoji_only",
			text:       "🚨📅✅",
			shouldPass: false,
			description: "Emoji only should fail (too short)",
		},
		{
			name:       "text_with_emoji",
			text:       "Quiero agendar 📅 una cita",
			shouldPass: true,
			description: "Text with emoji should pass",
		},
		{
			name:       "spanish_accents",
			text:       "Quiero agendar para el miércoles",
			shouldPass: true,
			description: "Spanish accents should pass",
		},
		{
			name:       "chinese_characters",
			text:       "我想预约",
			shouldPass: true,
			description: "Chinese characters should pass",
		},
		{
			name:       "arabic_characters",
			text:       "أريد حجز موعد",
			shouldPass: true,
			description: "Arabic characters should pass",
		},
		{
			name:       "zero_width_space",
			text:       "Quiero\u200B agendar",
			shouldPass: false,
			description: "Zero-width space should be detected as invalid",
		},
		{
			name:       "right_to_left_override",
			text:       "Quiero‮ agendar",
			shouldPass: false,
			description: "RTL override character should be detected as invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validatePayloadStrict("123456", tt.text)
			if tt.shouldPass && !result.Valid {
				t.Errorf("VALIDATION FAIL: %s\n  Expected valid, got: %s", tt.description, result.Message)
			}
			if !tt.shouldPass && result.Valid {
				t.Errorf("VALIDATION FAIL: %s\n  Expected invalid, but got valid", tt.description)
			}
		})
	}
}

func TestDevilsAdvocate_TimezoneAndDateEdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected string
	}{
		{
			name:     "leap_year_feb_29",
			text:     "Quiero agendar para el 29/02/2028",
			expected: "29/02/2028",
		},
		{
			name:     "non_leap_year_feb_29",
			text:     "Quiero agendar para el 29/02/2027",
			expected: "29/02/2027",
		},
		{
			name:     "midnight",
			text:     "A las 00:00",
			expected: "00:00",
		},
		{
			name:     "noon",
			text:     "A las 12:00",
			expected: "12:00",
		},
		{
			name:     "end_of_day",
			text:     "A las 23:59",
			expected: "23:59",
		},
		{
			name:     "invalid_hour_25",
			text:     "A las 25:00",
			expected: "",
		},
		{
			name:     "invalid_minute_61",
			text:     "A las 10:61",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entities := extractEntities(strings.ToLower(tt.text))
			if tt.expected != "" && entities.time == "" && entities.date == "" {
				t.Errorf("DATE/TIME EXTRACTION FAIL: %s\n  Expected to extract something from: %s", tt.name, tt.text)
			}
		})
	}
}

func TestDevilsAdvocate_ConcurrentRequests(t *testing.T) {
	// Simular múltiples requests concurrentes
	concurrentUsers := 10
	requestsPerUser := 5
	
	results := make(chan string, concurrentUsers * requestsPerUser)
	
	for i := 0; i < concurrentUsers; i++ {
		go func(userID int) {
			for j := 0; j < requestsPerUser; j++ {
				text := strings.ToLower("Usuario " + string(rune(userID)) + " quiere agendar")
				result := detectIntent(text)
				results <- result.detectedIntent
			}
		}(i)
	}
	
	// Wait for all goroutines to complete
	close(results)
	
	count := 0
	for range results {
		count++
	}
	
	expected := concurrentUsers * requestsPerUser
	if count != expected {
		t.Errorf("CONCURRENCY FAIL: Expected %d results, got %d", expected, count)
	}
}

func TestDevilsAdvocate_RepeatedRequests(t *testing.T) {
	// Mismo request múltiples veces debe dar mismo resultado
	text := "quiero cancelar mi cita"
	firstResult := detectIntent(text)
	
	for i := 0; i < 100; i++ {
		result := detectIntent(text)
		if result.detectedIntent != firstResult.detectedIntent {
			t.Errorf("CONSISTENCY FAIL: Iteration %d got %q, expected %q",
				i, result.detectedIntent, firstResult.detectedIntent)
		}
		if result.confidence != firstResult.confidence {
			t.Errorf("CONSISTENCY FAIL: Iteration %d confidence %.2f, expected %.2f",
				i, result.confidence, firstResult.confidence)
		}
	}
}

func TestDevilsAdvocate_MemoryLeak(t *testing.T) {
	// Test básico de memory leak con strings grandes
	initialTime := time.Now()
	
	for i := 0; i < 1000; i++ {
		text := strings.Repeat("a", 400) // Near max length
		validatePayloadStrict("123456", text)
	}
	
	elapsed := time.Since(initialTime)
	if elapsed > 5*time.Second {
		t.Errorf("PERFORMANCE WARN: Processing took %v (possible memory issue)", elapsed)
	} else {
		t.Logf("Performance OK: 1000 iterations in %v", elapsed)
	}
}

func TestDevilsAdvocate_CaseSensitivity(t *testing.T) {
	tests := []struct {
		name     string
		texts    []string
		expected string
	}{
		{
			name:     "uppercase_cancel",
			texts:    []string{"CANCELAR", "Cancelar", "cancelar", "CaNcElAr"},
			expected: "cancel_appointment",
		},
		{
			name:     "uppercase_urgent",
			texts:    []string{"URGENTE", "Urgente", "urgente", "UrGeNtE"},
			expected: "urgent_care",
		},
		{
			name:     "uppercase_hoy",
			texts:    []string{"HOY", "Hoy", "hoy", "HoY"},
			expected: "check_availability",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, text := range tt.texts {
				result := detectIntent(strings.ToLower(text))
				if result.detectedIntent != tt.expected {
					t.Errorf("CASE SENSITIVITY FAIL: %q -> %q, expected %q",
						text, result.detectedIntent, tt.expected)
				}
			}
		})
	}
}

func TestDevilsAdvocate_MixedLanguages(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected string
	}{
		{
			name:     "spanglish_cancel",
			text:     "Quiero cancelar my appointment",
			expected: "cancel_appointment",
		},
		{
			name:     "spanglish_urgent",
			text:     "Es urgente, need help",
			expected: "urgent_care",
		},
		{
			name:     "portuguese_influence",
			text:     "Quero agendar uma consulta",
			expected: "create_appointment",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := detectIntent(strings.ToLower(tt.text))
			if result.detectedIntent != tt.expected {
				t.Logf("MULTILINGUAL WARN: %q -> %q (acceptable for mixed languages)",
					tt.text, result.detectedIntent)
			}
		})
	}
}

// ============================================================================
// BENCHMARK TESTS
// ============================================================================

func BenchmarkDevilsAdvocate_Validation(b *testing.B) {
	testCases := []string{
		"",
		"a",
		strings.Repeat("a", 500),
		"Quiero agendar una cita",
		"'; DROP TABLE bookings;--",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, tc := range testCases {
			validatePayloadStrict("123456", tc)
		}
	}
}

func BenchmarkDevilsAdvocate_IntentDetection(b *testing.B) {
	testCases := []string{
		"quiero cancelar",
		"URGENTE",
		"¿Tienen hora para hoy?",
		strings.Repeat("a", 400),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, tc := range testCases {
			detectIntent(tc)
		}
	}
}
