import math
import re
import unicodedata
from typing import Any, Final, Optional, TypedDict
from f.nlu._constants import INTENT

"""
PRE-FLIGHT
Mission          : TF-IDF + Cosine Similarity intent classifier.
DB Tables        : NONE
Concurrency Risk : NO
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : NO
Zod Schemas      : NO
"""

# REFERENCE CORPUS — Real-world examples per intent
CORPUS: Final[dict[str, list[str]]] = {
    INTENT["CREAR_CITA"]: [
        "quiero agendar una cita para mañana",
        "necesito hora con el doctor el lunes",
        "kiero una ora pal viernes a las diez",
        "reservar turno con especialista",
        "agendar consulta medica urgente",
        "necesito cita urgente",
        "pedir hora para control",
        "kiero una ora",
        "weon kiero orita al tiro una sita po",
        "hola quiero agendar para manana a las 10",
    ],
    INTENT["CANCELAR_CITA"]: [
        "quiero cancelar mi cita del martes",
        "no podre ir kanselame la hora",
        "anular turno programado para manana",
        "eliminar cita agendada",
        "borrar mi reserva del jueves",
        "no podre ir kanselame",
        "cancelar la hora que tengo",
    ],
    INTENT["REAGENDAR_CITA"]: [
        "necesito cambiar mi cita del viernes al jueves",
        "reprogramar turno para la otra semana",
        "mejor para el miercoles a las once",
        "mover mi hora de manana para pasado",
        "kiero kambiar la cita pa otro dia",
    ],
    INTENT["VER_DISPONIBILIDAD"]: [
        "tienen disponibilidad para el lunes",
        "esta libre el doctor el martes por la manana",
        "hay hueco para hoy a las tres",
        "tiene ora disponible esta semana",
        "puedo agendar para manana",
        "tiene libre el lune",
        "hay hora para esta semana",
    ],
    INTENT["VER_MIS_CITAS"]: [
        "tengo alguna cita agendada",
        "cuando es mi hora",
        "mis citas proximas",
        "confirmame el turno que reserve",
        "quiero saber si tengo hora",
        "tengo cita para manana",
        "revisar mis reservas",
    ],
    INTENT["SALUDO"]: [
        "hola buenos dias",
        "buenas tardes doctor",
        "ola como esta",
        "saludos necesito ayuda",
        "buenas noches",
        "ola",
    ],
    INTENT["DESPEDIDA"]: [
        "chau gracias",
        "adios que tenga buen dia",
        "hasta luego",
        "nos vemos gracias por todo",
        "chao",
    ],
    INTENT["AGRADECIMIENTO"]: [
        "muchas gracias",
        "gracias po",
        "te agradezco mucho",
        "gracias doctor",
        "mil gracias",
    ],
}

STOP_WORDS: Final[set[str]] = {
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    "de", "del", "al", "para", "por", "con", "sin", "sobre",
    "es", "son", "esta", "estan", "fue", "ser", "hay",
    "que", "se", "no", "me", "te", "le", "les", "lo", "la",
    "mi", "tu", "su", "nuestro", "sus",
    "y", "o", "pero", "si", "como", "donde", "cuando",
    "muy", "mas", "menos", "bien", "asi",
    "necesito", "quiero", "puedo", "debo",
}

TYPO_MAP: Final[dict[str, str]] = {
    "kiero": "quiero", "ora": "hora", "lune": "lunes", "vierne": "viernes",
    "kansela": "cancela", "kanselame": "cancelame", "reprograma": "reprograma",
    "kambiar": "cambiar", "sita": "cita", "truno": "turno", "konsulta": "consulta",
    "agendar": "agendar", "manana": "mañana", "atencion": "atencion",
    "configuro": "configurar", "agendada": "agendada", "reservada": "reservada",
    "bieres": "viernes", "pal": "para el", "orita": "ahora", "po": "",
    "weon": "", "libre": "disponible",
}

def _normalize(text: str) -> list[str]:
    """Light normalization handles Chilean slang and common typos."""
    text = text.lower().strip()
    # Normalize unicode (accents)
    text = "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )
    # Remove punctuation
    text = re.sub(r"[?¿!¡.,;:()]", " ", text)
    tokens = text.split()
    
    result = []
    for w in tokens:
        mapped = TYPO_MAP.get(w, w)
        if len(mapped) > 1 and mapped not in STOP_WORDS:
            result.append(mapped)
    return result

def _compute_tf(tokens: list[str]) -> dict[str, float]:
    tf: dict[str, float] = {}
    for t in tokens:
        tf[t] = tf.get(t, 0.0) + 1.0
    
    length = len(tokens) or 1
    for t in tf:
        tf[t] = tf[t] / length
    return tf

def _compute_idf(documents: list[list[str]]) -> dict[str, float]:
    idf: dict[str, float] = {}
    n = len(documents)
    for doc in documents:
        seen = set(doc)
        for t in seen:
            idf[t] = idf.get(t, 0.0) + 1.0
    
    for t in idf:
        idf[t] = math.log(n / (1.0 + idf[t]))
    return idf

def _cosine_similarity(a: dict[str, float], b: dict[str, float], idf: dict[str, float]) -> float:
    all_terms = set(a.keys()) | set(b.keys())
    dot = 0.0
    mag_a = 0.0
    mag_b = 0.0

    for t in all_terms:
        w_a = a.get(t, 0.0) * idf.get(t, 0.0)
        w_b = b.get(t, 0.0) * idf.get(t, 0.0)
        dot += w_a * w_b
        mag_a += w_a * w_a
        mag_b += w_b * w_b

    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (math.sqrt(mag_a) * math.sqrt(mag_b))

# Model singleton
_MODEL: Optional[dict[str, Any]] = None

def _get_model() -> dict[str, Any]:
    global _MODEL
    if _MODEL is None:
        intents = list(CORPUS.keys())
        intent_docs_arr = []
        for intent in intents:
            docs = CORPUS[intent]
            for doc in docs:
                intent_docs_arr.append(_normalize(doc))
        
        idf = _compute_idf(intent_docs_arr)
        _MODEL = {
            "idf": idf,
            "intents": intents,
            "corpus": {intent: [_normalize(d) for d in docs] for intent, docs in CORPUS.items()}
        }
    return _MODEL

class TfIdfResult(TypedDict):
    intent: str
    confidence: float
    scores: list[dict[str, Any]]

def classify_intent(text: str) -> TfIdfResult:
    """Classifies the user intent using TF-IDF and Cosine Similarity."""
    model = _get_model()
    query_tokens = _normalize(text)
    
    if not query_tokens:
        return {"intent": INTENT["DESCONOCIDO"], "confidence": 0.0, "scores": []}

    query_tf = _compute_tf(query_tokens)
    scores: list[dict[str, Any]] = []

    for intent in model["intents"]:
        max_score = 0.0
        # Compare against each document in the corpus for this intent
        for doc_tokens in model["corpus"][intent]:
            doc_tf = _compute_tf(doc_tokens)
            sim = _cosine_similarity(query_tf, doc_tf, model["idf"])
            if sim > max_score:
                max_score = sim
        
        scores.append({"intent": intent, "score": max_score})

    # Sort descending
    scores.sort(key=lambda x: x["score"], reverse=True)

    # Normalize confidence
    top_score = scores[0]["score"] if scores else 0.0
    second_score = scores[1]["score"] if len(scores) > 1 else 0.0
    gap = top_score - second_score
    confidence = min(0.5 + gap * 3.0 + top_score * 2.0, 0.95)

    return {
        "intent": scores[0]["intent"] if scores else INTENT["DESCONOCIDO"],
        "confidence": confidence,
        "scores": scores[:3]
    }
