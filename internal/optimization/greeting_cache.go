package optimization

import (
	"strings"
	"unicode"
)

// GreetingCacheEntry - cache entry
type GreetingCacheEntry struct {
	Intent     string
	Confidence float64
	Response   string
	HitCount   int64
	Category   string
}

// GreetingCache - Chilean greetings with variations
var GreetingCache = map[string]GreetingCacheEntry{
	"hola":          {Intent: "greeting", Confidence: 0.99, Response: "¡Hola! ¿En qué puedo ayudarte?", Category: "greeting"},
	"ola":           {Intent: "greeting", Confidence: 0.95, Response: "¡Hola! ¿Cómo estás?", Category: "greeting"},
	"holaa":         {Intent: "greeting", Confidence: 0.95, Response: "¡Holaa! ¿Qué tal?", Category: "greeting"},
	"aló":           {Intent: "greeting", Confidence: 0.99, Response: "¡Aló! ¿Qué se cuenta?", Category: "greeting"},
	"alo":           {Intent: "greeting", Confidence: 0.99, Response: "¡Aló! ¿Cómo estás?", Category: "greeting"},
	"huena":          {Intent: "greeting", Confidence: 0.95, Response: "¡Wena! ¿Todo bien?", Category: "slang"},
	"huenas":         {Intent: "greeting", Confidence: 0.95, Response: "¡Wenas! ¿Cómo va?", Category: "slang"},
	"buenos dias":   {Intent: "greeting", Confidence: 0.99, Response: "¡Buenos días! ¿Cómo amaneciste?", Category: "greeting"},
	"buen dia":      {Intent: "greeting", Confidence: 0.95, Response: "¡Buen día! ¿Todo bien?", Category: "greeting"},
	"buenas tardes": {Intent: "greeting", Confidence: 0.99, Response: "¡Buenas tardes! ¿En qué ayudo?", Category: "greeting"},
	"buenas noches": {Intent: "greeting", Confidence: 0.99, Response: "¡Buenas noches! ¿Qué necesitas?", Category: "greeting"},
	"chau":          {Intent: "farewell", Confidence: 0.99, Response: "¡Hasta luego! Cuídate.", Category: "farewell"},
	"chau chau":     {Intent: "farewell", Confidence: 0.99, Response: "¡Chau chau! Nos vemos.", Category: "farewell"},
	"adios":         {Intent: "farewell", Confidence: 0.99, Response: "¡Hasta pronto! Que estés bien.", Category: "farewell"},
	"nos vemos":     {Intent: "farewell", Confidence: 0.95, Response: "¡Nos vemos! Cuídate.", Category: "farewell"},
	"gracias":       {Intent: "thank_you", Confidence: 0.99, Response: "¡De nada! Para eso estamos.", Category: "gratitude"},
	"muchas gracias":{Intent: "thank_you", Confidence: 0.99, Response: "¡Con gusto! ¿Algo más?", Category: "gratitude"},
	"mil gracias":   {Intent: "thank_you", Confidence: 0.99, Response: "¡No hay de qué!", Category: "gratitude"},
	"porfa":         {Intent: "politeness", Confidence: 0.95, Response: "¡Claro! ¿Qué necesitas?", Category: "politeness"},
	"por favor":     {Intent: "politeness", Confidence: 0.95, Response: "¡Por supuesto! ¿En qué ayudo?", Category: "politeness"},
	"que tal":       {Intent: "greeting", Confidence: 0.95, Response: "¡Todo bien! ¿Y tú?", Category: "greeting"},
	"q tal":         {Intent: "greeting", Confidence: 0.90, Response: "¡Todo bien! ¿Qué necesitas?", Category: "greeting"},
	"como anda":     {Intent: "greeting", Confidence: 0.95, Response: "¡Excelente! ¿Y tú?", Category: "greeting"},
	"como estas":    {Intent: "greeting", Confidence: 0.95, Response: "¡Muy bien! ¿Qué necesitas?", Category: "greeting"},
	"queubo":        {Intent: "greeting", Confidence: 0.90, Response: "¡Quéubo! ¿Qué se cuenta?", Category: "slang"},
	"bacan":         {Intent: "positive", Confidence: 0.85, Response: "¡Me alegro! ¿Qué necesitas?", Category: "slang"},
	"fome":          {Intent: "negative", Confidence: 0.75, Response: "¿Algo aburrido? ¿Cómo lo mejoro?", Category: "slang"},
	"weon":          {Intent: "slang", Confidence: 0.70, Response: "¿Qué pasa? ¿En qué ayudo?", Category: "slang"},
	"hueon":         {Intent: "slang", Confidence: 0.70, Response: "¿Todo bien? ¿Necesitas algo?", Category: "slang"},
	"conchetumadre": {Intent: "swear", Confidence: 0.80, Response: "Entiendo tu frustración. ¿Cómo puedo ayudarte?", Category: "swear"},
	"concha":        {Intent: "swear", Confidence: 0.75, Response: "¿Todo bien? ¿Necesitas ayuda?", Category: "swear"},
	"chucha":        {Intent: "swear", Confidence: 0.75, Response: "¿Algo te molesta? Cuéntame.", Category: "swear"},
	"hijoeputa":     {Intent: "swear", Confidence: 0.75, Response: "Lamento si algo te molestó. ¿Qué necesitas?", Category: "swear"},
}

// NormalizeInput - tildes, uppercase, spaces, typos
func NormalizeInput(input string) string {
	n := strings.ToLower(strings.TrimSpace(input))
	n = removeTildes(n)
	n = strings.Join(strings.Fields(n), " ")
	n = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' {
			return r
		}
		return -1
	}, n)
	subs := map[string]string{"k": "qu", "q": "que", "x": "por", "ss": "s", "zz": "s"}
	for wrong, right := range subs {
		n = strings.ReplaceAll(n, wrong, right)
	}
	n = strings.ReplaceAll(n, "we", "hue")
	return strings.TrimSpace(n)
}

func removeTildes(text string) string {
	repl := map[rune]rune{'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n'}
	result := make([]rune, 0, len(text))
	for _, r := range text {
		if rep, ok := repl[r]; ok {
			result = append(result, rep)
		} else {
			result = append(result, r)
		}
	}
	return string(result)
}

// CheckGreetingCache - check if input in cache
func CheckGreetingCache(input string) (string, float64, string, bool) {
	norm := NormalizeInput(input)
	if entry, ok := GreetingCache[norm]; ok {
		entry.HitCount++
		GreetingCache[norm] = entry
		return entry.Intent, entry.Confidence, entry.Response, true
	}
	for key, entry := range GreetingCache {
		if strings.Contains(norm, key) {
			entry.HitCount++
			GreetingCache[key] = entry
			return entry.Intent, entry.Confidence * 0.90, entry.Response, true
		}
		if len(norm) > 2 && strings.Contains(key, norm) {
			entry.HitCount++
			GreetingCache[key] = entry
			return entry.Intent, entry.Confidence * 0.85, entry.Response, true
		}
	}
	return "", 0.0, "", false
}

// GetCategory - get greeting category
func GetCategory(input string) string {
	norm := NormalizeInput(input)
	if entry, ok := GreetingCache[norm]; ok {
		return entry.Category
	}
	return "unknown"
}

// IsSwearWord - check for garabatos
func IsSwearWord(input string) bool {
	norm := NormalizeInput(input)
	swearWords := []string{"conchetumadre", "concha", "chucha", "hijoeputa", "puta", "weon", "hueon"}
	for _, sw := range swearWords {
		if strings.Contains(norm, sw) {
			return true
		}
	}
	return false
}

// GreetingCacheStats - for monitoring
type GreetingCacheStats struct {
	TotalEntries int
	TotalHits    int64
	AvgLatencyMs int64
}

func GetGreetingCacheStats() GreetingCacheStats {
	stats := GreetingCacheStats{TotalEntries: len(GreetingCache), TotalHits: 0, AvgLatencyMs: 5}
	for _, entry := range GreetingCache {
		stats.TotalHits += entry.HitCount
	}
	return stats
}
