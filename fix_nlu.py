from __future__ import annotations

import asyncio
import json
import os

import asyncpg


async def run() -> None:
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/booking_db"
    conn = await asyncpg.connect(db_url)
    await conn.execute("TRUNCATE TABLE nlu_rules")

    keywords: dict[str, object] = {
        "intent_keywords_saludo": ["hola", "buenas", "buenos dias", "buen dia", "saludos"],
        "intent_keywords_urgencia": ["urgencia", "emergencia", "ayuda", "socorro", "rapido"],
        "intent_keywords_crear_cita": ["agendar", "cita", "reservar", "programar"],
        "intent_keywords_despedida": ["adios", "bye", "hasta luego", "chao"],
        "intent_keywords_agradecimiento": ["gracias", "muchas gracias"],
        "intent_keywords_ver_mis_citas": ["mis citas", "ver citas", "mis reservas"],
        "intent_keywords_mostrar_menu_principal": ["menu", "inicio", "volver"],
        "urgencia": ["urgencia", "emergencia", "ayuda", "socorro", "rapido"],
        "greetings": ["hola", "buenas", "saludos"],
        "greeting_phrases": ["buenos dias", "buen dia"],
        "farewells": ["adios", "chao"],
        "farewell_phrases": ["hasta luego", "nos vemos"],
        "thank_you_words": ["gracias", "muchas gracias"],
        "urgency_words": ["urgencia", "emergencia", "rapido"],
        "flexibility_keywords": ["cambio", "otra", "reagendar"],
        "day_names": {
            "lunes": "Lunes",
            "martes": "Martes",
            "miercoles": "Miércoles",
            "jueves": "Jueves",
            "viernes": "Viernes",
            "sabado": "Sábado",
            "domingo": "Domingo",
        },
        "relative_dates": ["hoy", "mañana", "manana"],
        "service_types": ["medicina general", "cardiologia", "dermatologia"],
        "msg_slot_taken": "Ese horario ya fue reservado.",
        "msg_no_service": "No hay servicios.",
        "msg_generic": "Error.",
        "msg_main_menu": "Menu",
    }

    thresholds: dict[str, float] = {
        "medical_emergency_min": 0.8,
        "priority_queue_max": 0.6,
        "human_handoff_max": 0.4,
        "tfidf_minimum": 0.4,
        "high_min": 0.85,
    }

    for kw_key, kw_val in keywords.items():
        await conn.execute("INSERT INTO nlu_rules (rule_key, keywords) VALUES ($1, $2)", kw_key, json.dumps(kw_val))

    for th_key, th_val in thresholds.items():
        await conn.execute("INSERT INTO nlu_rules (rule_key, threshold_value) VALUES ($1, $2)", th_key, th_val)

    await conn.close()


asyncio.run(run())
