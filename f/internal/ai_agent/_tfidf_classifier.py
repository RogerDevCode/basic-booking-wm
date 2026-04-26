import re
import math
from typing import List, Dict, Set, Tuple, Optional, TypedDict
from ._constants import INTENT

# ============================================================================
# REFERENCE CORPUS — Real-world examples per intent
# ============================================================================

CORPUS: Dict[str, List[str]] = {
    INTENT['CREAR_CITA']: [
        'quiero agendar una cita para mañana',
        'necesito hora con el doctor el lunes',
        'kiero una ora pal viernes a las diez',
        'reservar turno con especialista',
        'agendar consulta medica urgente',
        'necesito cita urgente',
        'pedir hora para control',
        'kiero una ora',
        'weon kiero al tiro una sita po',
        'hola quiero agendar para manana a las 10',
    ],
    INTENT['CANCELAR_CITA']: [
        'quiero cancelar mi cita del martes',
        'no podre ir kanselame la hora',
        'anular turno programado para manana',
        'eliminar cita agendada',
        'borrar mi reserva del jueves',
        'no podre ir kanselame',
        'cancelar la hora que tengo',
    ],
    INTENT['REAGENDAR_CITA']: [
        'necesito cambiar mi cita del viernes al jueves',
        'reprogramar turno para la otra semana',
        'mejor para el miercoles a las once',
        'mover mi hora de manana para pasado',
        'kiero kambiar la cita pa otro dia',
    ],
    INTENT['VER_DISPONIBILIDAD']: [
        'tienen disponibilidad para el lunes',
        'esta libre el doctor el martes por la manana',
        'hay hueco para hoy a las tres',
        'tiene ora disponible esta semana',
        'puedo agendar para manana',
        'tiene libre el lune',
        'hay hora para esta semana',
    ],
    INTENT['VER_MIS_CITAS']: [
        'tengo alguna cita agendada',
        'cuando es mi hora',
        'mis citas proximas',
        'confirmame el turno que reserve',
        'quiero saber si tengo hora',
        'tengo cita para manana',
        'revisar mis reservas',
    ],
    INTENT['SALUDO']: [
        'hola buenos dias',
        'buenas tardes doctor',
        'ola como esta',
        'saludos necesito ayuda',
        'buenas noches',
        'ola',
    ],
    INTENT['DESPEDIDA']: [
        'chau gracias',
        'adios que tenga buen dia',
        'hasta luego',
        'nos vemos gracias por todo',
        'chao',
    ],
    INTENT['AGRADECIMIENTO']: [
        'muchas gracias',
        'gracias po',
        'te agradezco mucho',
        'gracias doctor',
        'mil gracias',
    ],
}

STOP_WORDS = {
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'al', 'para', 'por', 'con', 'sin', 'sobre',
    'es', 'son', 'esta', 'estan', 'fue', 'ser', 'hay',
    'que', 'se', 'no', 'me', 'te', 'le', 'les', 'lo', 'la',
    'mi', 'tu', 'su', 'nuestro', 'sus',
    'y', 'o', 'pero', 'si', 'como', 'donde', 'cuando',
    'muy', 'mas', 'menos', 'bien', 'asi',
    'necesito', 'quiero', 'puedo', 'debo'
}

TYPO_MAP = {
    'kiero': 'quiero', 'ora': 'hora', 'lune': 'lunes', 'vierne': 'viernes',
    'kansela': 'cancela', 'kanselame': 'cancelame', 'reprograma': 'reprograma',
    'kambiar': 'cambiar', 'sita': 'cita', 'truno': 'turno', 'konsulta': 'consulta',
    'agendar': 'agendar', 'manana': 'mañana', 'atencion': 'atencion',
    'bieres': 'viernes', 'pal': 'para el', 'orita': 'ahora', 'libre': 'disponible'
}

def normalize(text: str) -> List[str]:
    # Basic normalization
    text = text.lower()
    # Strip accents (simple version)
    accents = {'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n'}
    for char, replacement in accents.items():
        text = text.replace(char, replacement)
    
    # Remove symbols
    text = re.sub(r'[?¿!¡.,;:()]', ' ', text)
    tokens = text.split()
    
    result = []
    for t in tokens:
        t = TYPO_MAP.get(t, t)
        if len(t) > 1 and t not in STOP_WORDS:
            result.append(t)
    return result

def compute_tf(tokens: List[str]) -> Dict[str, float]:
    tf: Dict[str, float] = {}
    for t in tokens:
        tf[t] = tf.get(t, 0.0) + 1.0
    length = len(tokens) or 1
    return {k: v / length for k, v in tf.items()}

def compute_idf(documents: List[List[str]]) -> Dict[str, float]:
    idf: Dict[str, float] = {}
    n = len(documents)
    for doc in documents:
        seen = set(doc)
        for t in seen:
            idf[t] = idf.get(t, 0.0) + 1.0
    return {k: math.log(n / (1.0 + v)) for k, v in idf.items()}

def cosine_similarity(a: Dict[str, float], b: Dict[str, float], idf: Dict[str, float]) -> float:
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
    if mag_a == 0 or mag_b == 0: return 0.0
    return dot / (math.sqrt(mag_a) * math.sqrt(mag_b))

class TfIdfModel:
    def __init__(self) -> None:
        self.intents = list(CORPUS.keys())
        intent_docs = []
        for intent in self.intents:
            for doc in CORPUS[intent]:
                intent_docs.append(normalize(doc))
        self.idf = compute_idf(intent_docs)

_model: Optional[TfIdfModel] = None

def get_model() -> TfIdfModel:
    global _model
    if _model is None:
        _model = TfIdfModel()
    return _model

class Score(TypedDict):
    intent: str
    score: float

class TfIdfResult(TypedDict):
    intent: str
    confidence: float
    scores: List[Score]

def classify_intent(text: str) -> TfIdfResult:
    m = get_model()
    query_tokens = normalize(text)
    if not query_tokens:
        return {"intent": INTENT['DESCONOCIDO'], "confidence": 0.0, "scores": []}
    
    query_tf = compute_tf(query_tokens)
    scores: List[Score] = []

    for intent in m.intents:
        max_sim = 0.0
        for doc in CORPUS[intent]:
            doc_tf = compute_tf(normalize(doc))
            sim = cosine_similarity(query_tf, doc_tf, m.idf)
            if sim > max_sim: max_sim = sim
        scores.append({"intent": intent, "score": max_sim})

    scores.sort(key=lambda x: x["score"], reverse=True)
    
    top_score = scores[0]["score"]
    second_score = scores[1]["score"] if len(scores) > 1 else 0.0
    gap = top_score - second_score
    confidence = min(0.5 + gap * 3.0 + top_score * 2.0, 0.95)

    return {
        "intent": scores[0]["intent"],
        "confidence": confidence,
        "scores": scores[:3]
    }
