package main

import (
	"encoding/json"
	"fmt"
	"booking-titanium-wm/f/nn_03b_pipeline_agent"
)

func main() {
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println("  AI AGENT (NN_03-B) - INTEGRATION TESTS")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println()

	// Test cases covering all intents
	testCases := []struct {
		name           string
		input          string
		expectedIntent string
		minConfidence  float64
		shouldCache    bool
	}{
		// GREETINGS (cached)
		{"Greeting_Hola", "hola", "greeting", 0.95, true},
		{"Greeting_Ola_Typo", "ola", "greeting", 0.90, true},
		{"Greeting_Alo_Chilean", "aló", "greeting", 0.95, true},
		{"Greeting_Wena_Slang", "wena", "greeting", 0.90, true},
		{"Greeting_Buenos_Dias", "buenos dias", "greeting", 0.95, true},
		
		// CREATE APPOINTMENT
		{"Create_Quiero_Agendar", "quiero agendar una cita", "create_appointment", 0.70, false},
		{"Create_Necesito_Reservar", "necesito reservar", "create_appointment", 0.70, false},
		{"Create_Con_Fecha", "quiero agendar para mañana", "create_appointment", 0.70, false},
		
		// CANCEL APPOINTMENT
		{"Cancel_Quiero_Cancelar", "quiero cancelar mi cita", "cancel_appointment", 0.70, false},
		{"Cancel_Necesito_Anular", "necesito anular", "cancel_appointment", 0.70, false},
		
		// FAREWELLS (cached)
		{"Farewell_Chau", "chau", "farewell", 0.95, true},
		{"Farewell_Adios", "adios", "farewell", 0.95, true},
		
		// THANK YOU (cached)
		{"Thanks_Gracias", "gracias", "thank_you", 0.95, true},
		{"Thanks_Muchas_Gracias", "muchas gracias", "thank_you", 0.95, true},
		
		// CHILEAN SLANG (cached)
		{"Slang_Bacan", "bacan", "positive", 0.80, true},
		{"Slang_Fome", "fome", "negative", 0.70, true},
		{"Slang_Weon", "weon", "slang", 0.65, true},
		
		// SWEAR WORDS (cached, handled carefully)
		{"Swear_Conchetumadre", "conchetumadre", "swear", 0.75, true},
		{"Swear_Hijoeputa", "hijoeputa", "swear", 0.70, true},
		
		// POLITENESS (cached)
		{"Polite_Porfa", "porfa", "politeness", 0.90, true},
		{"Polite_Por_Favor", "por favor", "politeness", 0.90, true},
		
		// GENERAL QUESTIONS (not cached - needs AI)
		{"Question_Que_Servicios", "qué servicios ofrecen", "general_question", 0.60, false},
		{"Question_Horario", "cuál es el horario", "general_question", 0.60, false},
	}

	passCount := 0
	failCount := 0

	for i, tc := range testCases {
		fmt.Printf("TEST %d/%d: %s\n", i+1, len(testCases), tc.name)
		fmt.Printf("  Input: \"%s\"\n", tc.input)

		// Create input
		input := inner.PipelineInput{
			ChatID: "5391760292",
			Text:   tc.input,
		}

		// Execute pipeline
		result, err := inner.main(input)
		if err != nil {
			fmt.Printf("  ❌ ERROR: %v\n\n", err)
			failCount++
			continue
		}

		// Print output
		resultJSON, _ := json.MarshalIndent(result, "  ", "  ")
		fmt.Printf("  Output:\n  %s\n", string(resultJSON))

		// Validate
		success := true
		if result.Intent != tc.expectedIntent {
			fmt.Printf("  ⚠️  Intent mismatch: expected %s, got %s\n", tc.expectedIntent, result.Intent)
			success = false
		}
		if result.Confidence < tc.minConfidence {
			fmt.Printf("  ⚠️  Confidence too low: %.2f < %.2f\n", result.Confidence, tc.minConfidence)
			success = false
		}
		if result.Success != true {
			fmt.Printf("  ⚠️  Success should be true\n")
			success = false
		}

		if success {
			fmt.Printf("  ✅ PASS\n\n")
			passCount++
		} else {
			fmt.Printf("  ❌ FAIL\n\n")
			failCount++
		}
	}

	// Summary
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("RESULTS: %d/%d passed (%.1f%%)\n", passCount, len(testCases), float64(passCount)/float64(len(testCases))*100)
	fmt.Printf("Passed: %d | Failed: %d\n", passCount, failCount)
	fmt.Println("═══════════════════════════════════════════════════════════")
}
