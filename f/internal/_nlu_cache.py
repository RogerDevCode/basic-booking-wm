from __future__ import annotations

import json
import os
from typing import cast

import asyncpg
import redis

# Global memory cache (fallback for fast sync access if needed)
_NLU_CACHE: dict[str, object] = {}


def get_redis_client() -> redis.Redis:
    redis_url = os.getenv("REDIS_URL") or "redis://localhost:6379"
    return redis.from_url(redis_url, decode_responses=True)


async def load_nlu_rules_to_redis() -> None:
    """Loads NLU rules from Postgres to Redis."""
    db_url = os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/booking_db"
    conn = await asyncpg.connect(db_url)
    try:
        rows = await conn.fetch("SELECT rule_key, threshold_value, keywords FROM nlu_rules")
        r = get_redis_client()
        pipeline: object = r.pipeline()  # pyright: ignore[reportUnknownMemberType]
        for row in rows:
            key = f"nlu_rule:{row['rule_key']}"
            if row["keywords"] is not None:
                val = row["keywords"]
                if isinstance(val, str):
                    pipeline.set(key, val)  # type: ignore[attr-defined]
                else:
                    pipeline.set(key, json.dumps(val))  # type: ignore[attr-defined]
            elif row["threshold_value"] is not None:
                pipeline.set(key, str(row["threshold_value"]))  # type: ignore[attr-defined]
        pipeline.execute()  # type: ignore[attr-defined]
    finally:
        await conn.close()


async def ensure_nlu_cache() -> None:
    """Ensures the global memory cache is populated."""
    if _NLU_CACHE:
        return

    try:
        # Try loading from Redis first
        r = get_redis_client()
        keys: list[str] = cast("list[str]", r.keys("nlu_rule:*"))  # pyright: ignore[reportUnknownMemberType]

        if not keys:
            # Load from DB to Redis
            await load_nlu_rules_to_redis()
            keys = cast("list[str]", r.keys("nlu_rule:*"))  # pyright: ignore[reportUnknownMemberType]

        if not keys:
            return

        # Fetch all from Redis
        values = cast("list[str | None]", r.mget(keys))
        for k, v in zip(keys, values, strict=False):
            if not v:
                continue
            key_name = k.replace("nlu_rule:", "")
            try:
                _NLU_CACHE[key_name] = json.loads(v)
            except json.JSONDecodeError:
                try:
                    _NLU_CACHE[key_name] = float(v)
                except ValueError:
                    _NLU_CACHE[key_name] = v
    except Exception:
        # Fallback for tests when DB/Redis is not available
        _NLU_CACHE.clear()
        _NLU_CACHE.update(
            {
                "msg_main_menu": (
                    "📱 *Menú Principal*\n\n1️⃣ Agendar hora\n2️⃣ Mis horas\n3️⃣ Recordatorios\n4️⃣ Información\n5️⃣ Mis datos"
                ),
                "msg_slot_taken": "Ese horario ya fue reservado.",
                "msg_no_service": "No hay servicios.",
                "msg_generic": (
                    "No pudimos confirmar tu hora en este momento. Por favor intenta de nuevo en unos minutos."
                ),
                "intent_keywords_saludo": ["hola", "buenas"],
                "intent_keywords_urgencia": ["urgencia", "emergencia"],
                "urgencia": ["urgencia"],
                "urgency_words": ["urgencia", "emergencia", "rapido"],
                "greetings": ["hola", "buenas", "saludos"],
                "greeting_phrases": ["buenos dias", "buen dia"],
                "farewells": ["adios", "chao"],
                "farewell_phrases": ["hasta luego", "nos vemos"],
                "confidence_bound_high_min": 0.85,
                "escalation_medical_emergency_min": 0.8,
                "escalation_priority_queue_max": 0.6,
                "escalation_human_handoff_max": 0.4,
                "escalation_tfidf_minimum": 0.4,
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
            }
        )


def get_nlu_rule[T](rule_key: str, default: T) -> T:
    """Gets an NLU rule from the memory cache synchronously."""
    return cast("T", _NLU_CACHE.get(rule_key, default))
