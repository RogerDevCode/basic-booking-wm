#!/usr/bin/env python3
"""
Generate pre-computed embeddings for few-shot examples.
Uses sentence-transformers with a multilingual model.

Usage:
    pip install sentence-transformers
    python scripts/generate-fewshot-embeddings.py

Output:
    f/internal/ai_agent/fewshot-embeddings.json
"""

import json
import os
import sys

# The 25 few-shot examples from prompt-builder.ts (must stay in sync)
FEW_SHOT_EXAMPLES = [
    {"text": "Hola", "intent": "greeting"},
    {"text": "ola dotor", "intent": "greeting"},
    {"text": "Quiero agendar una cita para mañana", "intent": "create_appointment"},
    {"text": "kiero una ora pal bieres", "intent": "create_appointment"},
    {"text": "necesito resevar un truno", "intent": "create_appointment"},
    {"text": "tiene libre el lune?", "intent": "check_availability"},
    {"text": "tine ora hoy a las 10?", "intent": "check_availability"},
    {"text": "no podre ir manana, kanselame", "intent": "cancel_appointment"},
    {"text": "borrame la hora del martes po", "intent": "cancel_appointment"},
    {"text": "kiero kambiar la del bieres pal jueves", "intent": "reschedule"},
    {"text": "Me duele mucho la muela, necesito atención ya", "intent": "urgent_care"},
    {"text": "tengo un dolor insoportable de guata", "intent": "urgent_care"},
    {"text": "necesito cita urgente pa mañana", "intent": "create_appointment"},
    {"text": "¿A qué hora cierran los sábados?", "intent": "general_question"},
    {"text": "Chau, gracias", "intent": "farewell"},
    {"text": "Gracias po", "intent": "thank_you"},
    {"text": "¿Qué tiempo hace hoy?", "intent": "unknown"},
    {"text": "asdkjhaskjd", "intent": "unknown"},
    {"text": "Activa mis recordatorios", "intent": "activate_reminders"},
    {"text": "No quiero que me envíen recordatorios", "intent": "deactivate_reminders"},
    {"text": "tengo alguna cita agendada?", "intent": "get_my_bookings"},
    {"text": "cuando es mi ora?", "intent": "get_my_bookings"},
    {"text": "Menú principal", "intent": "show_main_menu"},
    {"text": "Siguiente", "intent": "wizard_step"},
    {
        "text": "Hola, quiero agendar para mañana a las 10",
        "intent": "create_appointment",
    },
]

# Recommended model for Spanish + multilingual support
MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
# Alternative (lighter, English-only): "sentence-transformers/all-MiniLM-L6-v2"


def main():
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "f",
        "internal",
        "ai_agent",
        "fewshot-embeddings.json",
    )

    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("ERROR: sentence-transformers not installed.")
        print("Run: pip install sentence-transformers")
        sys.exit(1)

    print(f"Loading model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)

    print(f"Embedding {len(FEW_SHOT_EXAMPLES)} few-shot examples...")
    texts = [ex["text"] for ex in FEW_SHOT_EXAMPLES]
    embeddings = model.encode(texts, normalize_embeddings=True)

    result = {
        "model": MODEL_NAME,
        "dimension": int(embeddings.shape[1]),
        "examples": [
            {
                "text": ex["text"],
                "intent": ex["intent"],
                "embedding": [round(float(v), 6) for v in emb],
            }
            for ex, emb in zip(FEW_SHOT_EXAMPLES, embeddings)
        ],
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(result['examples'])} embeddings to {output_path}")
    print(f"Dimension: {result['dimension']}")
    print(f"Model: {result['model']}")

    # Quick sanity check: verify similar texts are close
    greeting_idx = [
        i for i, ex in enumerate(FEW_SHOT_EXAMPLES) if ex["intent"] == "greeting"
    ]
    if len(greeting_idx) >= 2:
        from numpy import dot

        sim = float(dot(embeddings[greeting_idx[0]], embeddings[greeting_idx[1]]))
        print(f"Sanity check — greeting similarity: {sim:.4f} (should be > 0.5)")


if __name__ == "__main__":
    main()
