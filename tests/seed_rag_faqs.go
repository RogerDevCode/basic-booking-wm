package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/windmill-labs/windmill-go-client"
)

// FAQEntry representa una pregunta frecuente
type FAQEntry struct {
	Category string `json:"category"`
	Title    string `json:"title"`
	Content  string `json:"content"`
}

// faqs son las preguntas frecuentes reales del sistema médico
var faqs = []FAQEntry{
	{
		Category: "servicios",
		Title:    "¿Qué servicios médicos ofrecen?",
		Content:  "Ofrecemos consulta general, medicina interna, cardiología, pediatría, ginecología, dermatología, psicología, nutrición, fisioterapia, y laboratorio clínico. Todos nuestros servicios cuentan con profesionales certificados y tecnología de vanguardia.",
	},
	{
		Category: "servicios",
		Title:    "¿Realizan exámenes de laboratorio?",
		Content:  "Sí, contamos con laboratorio clínico propio para exámenes de sangre, orina, heces, cultivos, pruebas de alergias, marcadores tumorales, hormonas, y más. Los resultados se entregan en 24-48 horas hábiles.",
	},
	{
		Category: "servicios",
		Title:    "¿Tienen servicio de urgencias?",
		Content:  "Contamos con servicio de urgencias básicas de lunes a viernes de 7:00 AM a 7:00 PM. Para emergencias fuera de este horario, recomendamos dirigir al hospital más cercano o llamar al 911.",
	},
	{
		Category: "agenda",
		Title:    "¿Cómo puedo agendar una cita?",
		Content:  "Puedes agendar tu cita a través de nuestro bot de Telegram (@tu_clinica_bot), llamando al (555) 123-4567, o visitando nuestra recepción. También puedes solicitar cita mediante nuestro sitio web en la sección de reservas.",
	},
	{
		Category: "agenda",
		Title:    "¿Con cuánta anticipación debo agendar?",
		Content:  "Recomendamos agendar con al menos 3-5 días de anticipación para consulta general. Para especialidades, el tiempo de espera puede ser de 1-2 semanas. Urgencias se atienden el mismo día.",
	},
	{
		Category: "agenda",
		Title:    "¿Puedo cancelar o reagendar mi cita?",
		Content:  "Sí, puedes cancelar o reagendar hasta 24 horas antes de tu cita sin costo. Cancelaciones con menos de 24 horas tienen un cargo del 50% del valor de la consulta. Puedes hacerlo vía Telegram, teléfono o en recepción.",
	},
	{
		Category: "pagos",
		Title:    "¿Qué métodos de pago aceptan?",
		Content:  "Aceptamos efectivo, tarjetas de crédito y débito (Visa, MasterCard, American Express), transferencias bancarias, y pagos mediante aplicaciones móviles (Yape, Plin, Tunki). También trabajamos con algunas aseguradoras.",
	},
	{
		Category: "pagos",
		Title:    "¿Aceptan seguros médicos?",
		Content:  "Trabajamos con Pacífico, Rimac, Mapfre, La Positiva, y Seguro Esencial. Verifica con tu aseguradora si estamos en su red. Si tu seguro no está conveniado, puedes pagar particular y solicitar reembolso.",
	},
	{
		Category: "pagos",
		Title:    "¿Necesito referencia para consulta?",
		Content:  "No necesitas referencia médica para consulta general ni la mayoría de especialidades. Solo algunos exámenes especializados requieren orden médica por protocolos de laboratorio.",
	},
	{
		Category: "preparacion",
		Title:    "¿Debo ir en ayunas para mi consulta?",
		Content:  "Para consulta general no es necesario ir en ayunas. Si te realizarán exámenes de sangre, deberás ayunar 8-12 horas. Toma solo agua si tienes sed. Para ecografías abdominales, ayuno de 6 horas.",
	},
	{
		Category: "preparacion",
		Title:    "¿Qué documentos debo llevar?",
		Content:  "Debes llevar tu DNI o documento de identidad, carné del seguro (si aplica), órdenes médicas o resultados de exámenes previos relacionados con tu consulta, y lista de medicamentos que tomas actualmente.",
	},
	{
		Category: "preparacion",
		Title:    "¿Puedo llevar acompañante?",
		Content:  "Sí, puedes llevar un acompañante. Por protocolo sanitario, solo ingresa una persona por paciente a la consulta. Menores de edad deben estar acompañados por padre, madre o apoderado.",
	},
	{
		Category: "horarios",
		Title:    "¿Cuál es el horario de atención?",
		Content:  "Atendemos de lunes a viernes de 7:00 AM a 8:00 PM, sábados de 8:00 AM a 1:00 PM. Urgencias básicas de lunes a viernes 7:00 AM a 7:00 PM. Domingos y feriados cerrado, salvo emergencias.",
	},
	{
		Category: "horarios",
		Title:    "¿Atienden domingos o feriados?",
		Content:  "No atendemos domingos ni feriados regulares. Para emergencias en estos días, recomendamos dirigir al hospital más cercano o llamar al 911. Puedes dejar mensaje en Telegram y te respondemos el siguiente día hábil.",
	},
	{
		Category: "ubicacion",
		Title:    "¿Dónde están ubicados?",
		Content:  "Estamos en Av. Principal 123, Centro Comercial Plaza, Segundo Piso, Distrito Central. Contamos con parqueamiento gratuito por 2 horas. Referencia: frente al banco BCP, al lado de la farmacia Inkafarma.",
	},
	{
		Category: "ubicacion",
		Title:    "¿Cómo llego en transporte público?",
		Content:  "Puedes llegar en las rutas de autobús 101, 102, 205, 306. Bájate en la parada Plaza Central. También puedes usar Uber, Beat, o InDrive. El viaje desde el centro toma aproximadamente 15 minutos.",
	},
	{
		Category: "telemedicina",
		Title:    "¿Ofrecen consultas virtuales?",
		Content:  "Sí, ofrecemos telemedicina para seguimiento de tratamientos, resultados de exámenes, orientación médica, y recetas. La consulta virtual tiene el mismo costo que presencial. Se realiza por videollamada segura.",
	},
	{
		Category: "telemedicina",
		Title:    "¿Cómo funciona la telemedicina?",
		Content:  "Agenda tu cita virtual. Recibirás un enlace seguro por correo o WhatsApp 10 minutos antes. Conéctate desde tu celular, tablet o computadora con cámara y micrófono. El médico te atenderá como en consulta presencial.",
	},
	{
		Category: "resultados",
		Title:    "¿Cuándo entregan resultados de exámenes?",
		Content:  "Exámenes básicos (hemograma, orina): 24 horas. Exámenes especializados (hormonas, cultivos): 48-72 horas. Biopsias: 5-7 días hábiles. Puedes recoger resultados en recepción o solicitar envío por correo electrónico.",
	},
	{
		Category: "resultados",
		Title:    "¿Pueden enviar resultados por correo?",
		Content:  "Sí, enviamos resultados por correo electrónico seguro. Solicítalo en recepción o por Telegram. Los resultados también están disponibles en nuestra plataforma online con usuario y contraseña.",
	},
}

func main() {
	ctx := context.Background()

	// Get Groq API key for embeddings
	groqKey := os.Getenv("GROQ_API_KEY")
	if groqKey == "" {
		fmt.Println("❌ GROQ_API_KEY not set. Using placeholder embeddings.")
	}

	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Println("  RAG DATABASE SEEDING - MEDICAL FAQ")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("📚 Total FAQs to seed: %d\n", len(faqs))
	fmt.Println()

	// Connect to Neon DB
	dbURL := os.Getenv("NEON_DATABASE_URL")
	if dbURL == "" {
		fmt.Println("❌ NEON_DATABASE_URL not set")
		os.Exit(1)
	}

	fmt.Println("✅ Connected to Neon database")

	// Seed FAQs
	inserted := 0
	errors := 0

	for i, faq := range faqs {
		// Generate embedding (or placeholder)
		var embedding []float64
		if groqKey != "" {
			embedding, _ = generateEmbedding(ctx, groqKey, faq.Title+" "+faq.Content)
		} else {
			// Use placeholder embedding (1536 dimensions with small values)
			embedding = make([]float64, 1536)
			for j := range embedding {
				embedding[j] = float64(j%100) / 1000.0
			}
		}

		// Insert into DB
		err := insertFAQ(dbURL, faq, embedding)
		if err != nil {
			fmt.Printf("❌ Error inserting FAQ %d (%s): %v\n", i+1, faq.Title, err)
			errors++
		} else {
			inserted++
			fmt.Printf("✅ Inserted: [%s] %s\n", faq.Category, faq.Title)
		}

		// Rate limiting
		time.Sleep(100 * time.Millisecond)
	}

	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("  SEEDING COMPLETE\n")
	fmt.Println("═══════════════════════════════════════════════════════════")
	fmt.Printf("✅ Inserted: %d/%d\n", inserted, len(faqs))
	fmt.Printf("❌ Errors: %d\n", errors)
	fmt.Println()
}

func generateEmbedding(ctx context.Context, apiKey, text string) ([]float64, error) {
	// Use Groq or OpenAI API for embeddings
	// Placeholder implementation
	return nil, nil
}

func insertFAQ(dbURL string, faq FAQEntry, embedding []float64) error {
	// Use Windmill DB resource or direct connection
	// Placeholder implementation
	return nil
}
