import asyncio
import json
import os
import asyncpg

from f.internal.ai_agent._constants import (
    INTENT_KEYWORDS,
    NORMALIZATION_MAP,
    PROFANITY_TO_IGNORE,
    OFF_TOPIC_PATTERNS,
    GREETINGS,
    GREETING_PHRASES,
    FAREWELLS,
    FAREWELL_PHRASES,
    THANK_YOU_WORDS,
    URGENCY_WORDS,
    FLEXIBILITY_KEYWORDS,
    DAY_NAMES,
    RELATIVE_DATES,
    SERVICE_TYPES,
)

async def seed_nlu_rules():
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/booking_db"
    conn = await asyncpg.connect(db_url)
    
    try:
        # Read and execute migration file
        with open("migrations/017_create_nlu_rules.sql", "r") as f:
            await conn.execute(f.read())
            
        print("Migration 017 executed.")

        # Seed intent keywords
        for intent, data in INTENT_KEYWORDS.items():
            rule_key = f"intent_keywords_{intent}"
            keywords_json = json.dumps(data)
            await conn.execute(
                """
                INSERT INTO nlu_rules (rule_key, keywords, description)
                VALUES ($1, $2::jsonb, $3)
                ON CONFLICT (rule_key) DO UPDATE SET keywords = EXCLUDED.keywords
                """,
                rule_key,
                keywords_json,
                f"Keywords and weight for {intent}"
            )
            
        # Seed lists and dictionaries
        other_rules = {
            "normalization_map": NORMALIZATION_MAP,
            "profanity_to_ignore": PROFANITY_TO_IGNORE,
            "off_topic_patterns": OFF_TOPIC_PATTERNS,
            "greetings": GREETINGS,
            "greeting_phrases": GREETING_PHRASES,
            "farewells": FAREWELLS,
            "farewell_phrases": FAREWELL_PHRASES,
            "thank_you_words": THANK_YOU_WORDS,
            "urgency_words": URGENCY_WORDS,
            "flexibility_keywords": FLEXIBILITY_KEYWORDS,
            "day_names": DAY_NAMES,
            "relative_dates": RELATIVE_DATES,
            "service_types": SERVICE_TYPES,
            
            # UI Messages
            "msg_slot_taken": "Ese horario ya fue reservado por otra persona. Por favor elige un horario diferente.",
            "msg_no_service": "El profesional seleccionado no tiene servicios disponibles en este momento. Intenta con otro profesional.",
            "msg_generic": "No pudimos confirmar tu cita en este momento. Por favor intenta de nuevo en unos minutos.",
            "msg_main_menu": "📱 *Menú Principal*\n\n1️⃣ Agendar cita\n2️⃣ Mis citas\n3️⃣ Recordatorios\n4️⃣ Información\n5️⃣ Mis datos"
        }
        
        for key, value in other_rules.items():
            await conn.execute(
                """
                INSERT INTO nlu_rules (rule_key, keywords, description)
                VALUES ($1, $2::jsonb, $3)
                ON CONFLICT (rule_key) DO UPDATE SET keywords = EXCLUDED.keywords
                """,
                key,
                json.dumps(value),
                f"Data for {key}"
            )
            
        print("All NLU constants successfully seeded to nlu_rules table.")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(seed_nlu_rules())
