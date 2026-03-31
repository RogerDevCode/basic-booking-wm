package main
import ("fmt"; "booking-titanium-wm/internal/optimization")
func main() {
	tests := []string{"hola", "ola", "aló", "alo", "wena", "wenas", "buenos dias", "adios", "q tal", "porfa", "bacan", "fome", "weon", "hueon", "conchetumadre"}
	fmt.Println("CHILEAN GREETING CACHE TEST")
	for _, t := range tests {
		i, c, r, ok := optimization.CheckGreetingCache(t)
		if ok { fmt.Printf("✅ \"%s\" → %s (%.0f%%)\n   → %s\n\n", t, i, c*100, r) } 
		else { fmt.Printf("❌ \"%s\" → NOT CACHED\n\n", t) }
	}
}
