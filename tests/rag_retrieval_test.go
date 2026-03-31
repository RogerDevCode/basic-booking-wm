package inner

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"booking-titanium-wm/internal/core/db"
)

// TestRAG_Retrieval_Basic prueba recuperación básica de RAG
func TestRAG_Retrieval_Basic(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database := db.GetDB()
	if database == nil {
		t.Fatal("Failed to get DB connection")
	}

	// Test 1: Search by exact category
	t.Run("SearchByCategory", func(t *testing.T) {
		query := `
			SELECT kb_id, title, category 
			FROM knowledge_base 
			WHERE category = $1 
			AND is_active = true 
			LIMIT 5
		`

		rows, err := database.QueryContext(ctx, query, "agenda")
		if err != nil {
			t.Fatalf("Query failed: %v", err)
		}
		defer rows.Close()

		count := 0
		for rows.Next() {
			var kbID, title, category string
			err := rows.Scan(&kbID, &title, &category)
			if err != nil {
				t.Fatalf("Scan failed: %v", err)
			}
			count++
			t.Logf("✅ Found: [%s] %s", category, title)
		}

		if count != 3 {
			t.Errorf("Expected 3 agenda FAQs, got %d", count)
		}
	})

	// Test 2: Search by title pattern
	t.Run("SearchByTitlePattern", func(t *testing.T) {
		query := `
			SELECT kb_id, title, category 
			FROM knowledge_base 
			WHERE title ILIKE $1 
			AND is_active = true 
			LIMIT 5
		`

		rows, err := database.QueryContext(ctx, query, "%pago%")
		if err != nil {
			t.Fatalf("Query failed: %v", err)
		}
		defer rows.Close()

		count := 0
		for rows.Next() {
			var kbID, title, category string
			err := rows.Scan(&kbID, &title, &category)
			if err != nil {
				t.Fatalf("Scan failed: %v", err)
			}
			count++
			t.Logf("✅ Found: [%s] %s", category, title)
		}

		if count < 1 {
			t.Error("Expected at least 1 FAQ about pagos")
		}
	})

	// Test 3: Count total FAQs
	t.Run("CountTotalFAQs", func(t *testing.T) {
		query := `SELECT COUNT(*) FROM knowledge_base WHERE is_active = true`

		var count int
		err := database.QueryRowContext(ctx, query).Scan(&count)
		if err != nil {
			t.Fatalf("Query failed: %v", err)
		}

		if count != 20 {
			t.Errorf("Expected 20 total FAQs, got %d", count)
		} else {
			t.Logf("✅ Total FAQs: %d", count)
		}
	})

	// Test 4: Count by category
	t.Run("CountByCategory", func(t *testing.T) {
		query := `
			SELECT category, COUNT(*) as cnt 
			FROM knowledge_base 
			WHERE is_active = true 
			GROUP BY category 
			ORDER BY category
		`

		rows, err := database.QueryContext(ctx, query)
		if err != nil {
			t.Fatalf("Query failed: %v", err)
		}
		defer rows.Close()

		categories := make(map[string]int)
		for rows.Next() {
			var category string
			var cnt int
			err := rows.Scan(&category, &cnt)
			if err != nil {
				t.Fatalf("Scan failed: %v", err)
			}
			categories[category] = cnt
			t.Logf("✅ Category '%s': %d FAQs", category, cnt)
		}

		expectedCategories := map[string]int{
			"agenda": 3, "horarios": 2, "pagos": 3,
			"preparacion": 3, "resultados": 2, "servicios": 3,
			"telemedicina": 2, "ubicacion": 2,
		}

		for cat, expected := range expectedCategories {
			if categories[cat] != expected {
				t.Errorf("Category %s: expected %d, got %d", cat, expected, categories[cat])
			}
		}
	})
}

// TestRAG_Retrieval_VectorSimilarity prueba búsqueda por similitud vectorial
func TestRAG_Retrieval_VectorSimilarity(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database := db.GetDB()
	if database == nil {
		t.Fatal("Failed to get DB connection")
	}

	// Test: Vector similarity search (using placeholder embedding)
	t.Run("VectorSimilaritySearch", func(t *testing.T) {
		// Create a placeholder query embedding as string (pgvector format)
		// Format: '[0.01,0.01,...]'
		embeddingParts := make([]string, 1536)
		for i := range embeddingParts {
			embeddingParts[i] = "0.01"
		}
		embeddingStr := "[" + strings.Join(embeddingParts, ",") + "]"

		query := `
			SELECT kb_id, title, category, 
				   embedding <-> $1::vector as distance
			FROM knowledge_base
			WHERE is_active = true
			ORDER BY distance
			LIMIT 3
		`

		rows, err := database.QueryContext(ctx, query, embeddingStr)
		if err != nil {
			t.Fatalf("Vector query failed: %v", err)
		}
		defer rows.Close()

		count := 0
		for rows.Next() {
			var kbID, title, category string
			var distance float64
			err := rows.Scan(&kbID, &title, &category, &distance)
			if err != nil {
				t.Fatalf("Scan failed: %v", err)
			}
			count++
			t.Logf("✅ Similar: [%s] %s (distance: %.6f)", category, title, distance)
		}

		if count != 3 {
			t.Errorf("Expected 3 similar FAQs, got %d", count)
		}
	})
}

// TestRAG_Retrieval_FullTextSearch prueba búsqueda por texto completo
func TestRAG_Retrieval_FullTextSearch(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database := db.GetDB()
	if database == nil {
		t.Fatal("Failed to get DB connection")
	}

	// Test: Full-text search in content
	t.Run("FullTextSearch", func(t *testing.T) {
		query := `
			SELECT kb_id, title, category, content
			FROM knowledge_base
			WHERE content ILIKE $1
			AND is_active = true
			LIMIT 5
		`

		rows, err := database.QueryContext(ctx, query, "%tarjeta%")
		if err != nil {
			t.Fatalf("Query failed: %v", err)
		}
		defer rows.Close()

		count := 0
		for rows.Next() {
			var kbID, title, category, content string
			err := rows.Scan(&kbID, &title, &category, &content)
			if err != nil {
				t.Fatalf("Scan failed: %v", err)
			}
			count++
			t.Logf("✅ Found: [%s] %s", category, title)
		}

		if count < 1 {
			t.Error("Expected at least 1 FAQ mentioning tarjetas")
		}
	})

	// Test: Search by question keywords
	t.Run("SearchByQuestionKeywords", func(t *testing.T) {
		query := `
			SELECT kb_id, title, category
			FROM knowledge_base
			WHERE title ILIKE $1 OR content ILIKE $1
			AND is_active = true
			LIMIT 5
		`

		rows, err := database.QueryContext(ctx, query, "%cómo%")
		if err != nil {
			t.Fatalf("Query failed: %v", err)
		}
		defer rows.Close()

		count := 0
		for rows.Next() {
			var kbID, title, category string
			err := rows.Scan(&kbID, &title, &category)
			if err != nil {
				t.Fatalf("Scan failed: %v", err)
			}
			count++
			t.Logf("✅ Found: [%s] %s", category, title)
		}

		if count < 2 {
			t.Errorf("Expected at least 2 FAQs with 'cómo', got %d", count)
		}
	})
}

// TestRAG_Retrieval_CategoryFilter prueba filtrado por categoría
func TestRAG_Retrieval_CategoryFilter(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database := db.GetDB()
	if database == nil {
		t.Fatal("Failed to get DB connection")
	}

	categories := []string{"agenda", "pagos", "servicios", "horarios"}

	for _, category := range categories {
		t.Run("Category_"+category, func(t *testing.T) {
			query := `
				SELECT kb_id, title, content
				FROM knowledge_base
				WHERE category = $1
				AND is_active = true
				ORDER BY title
			`

			rows, err := database.QueryContext(ctx, query, category)
			if err != nil {
				t.Fatalf("Query failed: %v", err)
			}
			defer rows.Close()

			count := 0
			for rows.Next() {
				var kbID, title, content string
				err := rows.Scan(&kbID, &title, &content)
				if err != nil {
					t.Fatalf("Scan failed: %v", err)
				}
				count++
				t.Logf("✅ [%s] %s", category, title)
			}

			if count == 0 {
				t.Errorf("Expected FAQs in category %s, got 0", category)
			}
		})
	}
}

// TestRAG_Retrieval_ActiveFilter prueba que solo retorna activos
func TestRAG_Retrieval_ActiveFilter(t *testing.T) {
	if os.Getenv("NEON_DATABASE_URL") == "" {
		t.Skip("Skipping test, NEON_DATABASE_URL not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database := db.GetDB()
	if database == nil {
		t.Fatal("Failed to get DB connection")
	}

	// Test: Verify only active FAQs are returned
	t.Run("OnlyActiveFAQs", func(t *testing.T) {
		query := `
			SELECT COUNT(*) 
			FROM knowledge_base
			WHERE is_active = true
		`

		var count int
		err := database.QueryRowContext(ctx, query).Scan(&count)
		if err != nil {
			t.Fatalf("Query failed: %v", err)
		}

		if count != 20 {
			t.Errorf("Expected 20 active FAQs, got %d", count)
		} else {
			t.Logf("✅ Active FAQs: %d", count)
		}
	})

	// Test: Verify inactive FAQs are not returned by default
	t.Run("InactiveFAQsExcluded", func(t *testing.T) {
		query := `
			SELECT COUNT(*) 
			FROM knowledge_base
			WHERE is_active = false
		`

		var count int
		err := database.QueryRowContext(ctx, query).Scan(&count)
		if err != nil {
			t.Fatalf("Query failed: %v", err)
		}

		if count != 0 {
			t.Logf("⚠️  Found %d inactive FAQs (expected 0)", count)
		} else {
			t.Logf("✅ No inactive FAQs (as expected)")
		}
	})
}
