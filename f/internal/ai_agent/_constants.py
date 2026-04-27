from typing import Final, Literal, TypedDict

# ============================================================================
# INTENT CONSTANTS — Single Source of Truth (v3)
# ============================================================================

IntentType = Literal[
    "crear_cita",
    "cancelar_cita",
    "reagendar_cita",
    "ver_disponibilidad",
    "urgencia",
    "pregunta_general",
    "saludo",
    "despedida",
    "agradecimiento",
    "activar_recordatorios",
    "desactivar_recordatorios",
    "preferencias_recordatorio",
    "mostrar_menu_principal",
    "paso_wizard",
    "ver_mis_citas",
    "desconocido",
]


class IntentsStruct(TypedDict):
    CREAR_CITA: Literal["crear_cita"]
    CANCELAR_CITA: Literal["cancelar_cita"]
    REAGENDAR_CITA: Literal["reagendar_cita"]
    VER_DISPONIBILIDAD: Literal["ver_disponibilidad"]
    URGENCIA: Literal["urgencia"]
    PREGUNTA_GENERAL: Literal["pregunta_general"]
    SALUDO: Literal["saludo"]
    DESPEDIDA: Literal["despedida"]
    AGRADECIMIENTO: Literal["agradecimiento"]
    ACTIVAR_RECORDATORIOS: Literal["activar_recordatorios"]
    DESACTIVAR_RECORDATORIOS: Literal["desactivar_recordatorios"]
    PREFERENCIAS_RECORDATORIO: Literal["preferencias_recordatorio"]
    MOSTRAR_MENU_PRINCIPAL: Literal["mostrar_menu_principal"]
    PASO_WIZARD: Literal["paso_wizard"]
    VER_MIS_CITAS: Literal["ver_mis_citas"]
    DESCONOCIDO: Literal["desconocido"]


INTENT: Final[IntentsStruct] = {
    "CREAR_CITA": "crear_cita",
    "CANCELAR_CITA": "cancelar_cita",
    "REAGENDAR_CITA": "reagendar_cita",
    "VER_DISPONIBILIDAD": "ver_disponibilidad",
    "URGENCIA": "urgencia",
    "PREGUNTA_GENERAL": "pregunta_general",
    "SALUDO": "saludo",
    "DESPEDIDA": "despedida",
    "AGRADECIMIENTO": "agradecimiento",
    "ACTIVAR_RECORDATORIOS": "activar_recordatorios",
    "DESACTIVAR_RECORDATORIOS": "desactivar_recordatorios",
    "PREFERENCIAS_RECORDATORIO": "preferencias_recordatorio",
    "MOSTRAR_MENU_PRINCIPAL": "mostrar_menu_principal",
    "PASO_WIZARD": "paso_wizard",
    "VER_MIS_CITAS": "ver_mis_citas",
    "DESCONOCIDO": "desconocido",
}

CONFIDENCE_THRESHOLDS: Final[dict[IntentType, float]] = {
    "urgencia": 0.5,
    "cancelar_cita": 0.5,
    "reagendar_cita": 0.5,
    "crear_cita": 0.3,
    "ver_disponibilidad": 0.3,
    "saludo": 0.5,
    "despedida": 0.5,
    "agradecimiento": 0.5,
    "pregunta_general": 0.5,
    "activar_recordatorios": 0.5,
    "desactivar_recordatorios": 0.5,
    "preferencias_recordatorio": 0.5,
    "mostrar_menu_principal": 0.5,
    "paso_wizard": 0.5,
    "ver_mis_citas": 0.5,
    "desconocido": 0.0,
}


class KeywordDef(TypedDict):
    keywords: list[str]
    weight: int


INTENT_KEYWORDS: Final[dict[IntentType, KeywordDef]] = {
    "urgencia": {
        "keywords": [
            "urgente",
            "emergencia",
            "urgencia",
            "ya mismo",
            "ahora mismo",
            "inmediato",
            "dolor",
            "sangrando",
            "no puedo esperar",
            "urjente",
            "urgnete",
            "urjencia",
            "nececito atencion",
            "necesito atencion",
            "necesito atencion ya",
            "atencion urgente",
            "atencion de emergencia",
        ],
        "weight": 10,
    },
    "cancelar_cita": {
        "keywords": [
            "cancelar",
            "anular",
            "eliminar",
            "borrar",
            "dar de baja",
            "no necesito",
            "kanselar",
            "cancelsr",
            "anualr",
            "no voy a poder",
            "no voy a ir",
            "ya no voy",
            "cambié de opinión",
            "cancela todo",
            "no iré",
        ],
        "weight": 4,
    },
    "reagendar_cita": {
        "keywords": [
            "reprogramar",
            "reagendar",
            "cambiar",
            "mover",
            "trasladar",
            "pasar",
            "modificar",
            "reporgramar",
            "mejor para",
            "me equivoqué de hora",
            "otro día",
            "para otro",
        ],
        "weight": 4,
    },
    "ver_disponibilidad": {
        "keywords": [
            "disponibilidad",
            "disponible",
            "hueco",
            "espacio",
            "libre",
            "tienen",
            "lugar",
            "horario",
            "busco",
            "atiende los",
            "atiende los sábados",
        ],
        "weight": 3,
    },
    "crear_cita": {
        "keywords": [
            "reservar",
            "agendar",
            "cita",
            "turno",
            "sacar",
            "pedir hora",
            "necesito hora",
            "consulta",
            "visita",
            "ver al doctor",
            "ajendar",
            "konsulta",
            "cosulta",
            "resevar",
            "reserba",
            "truno",
            "sita",
            "chequeo general",
            "sacarme la muela",
            "dolor de guata",
            "la hora con el doctor",
            "que me den la hora",
            "pasado mañana",
            "próximo bisiesto",
            "medianoche",
            "estaba agendando",
            "agenda",
        ],
        "weight": 3,
    },
    "ver_mis_citas": {
        "keywords": [
            "confirmame la cita",
            "mis citas",
            "mi cita",
            "confirmación",
            "no me llegó",
            "no fui a mi cita",
            "ya completé",
            "certificado",
            "pendiente",
            "atendido",
            "me cobraron",
            "reprogramada automáticamente",
            "tengo alguna cita",
            "tengo cita",
            "mi hora",
            "tengo turno",
            "cuando es mi hora",
            "ver mis citas",
            "revisar mis citas",
        ],
        "weight": 4,
    },
    "despedida": {
        "keywords": ["mejor no quiero", "gracias", "adiós", "chao", "chau", "hasta luego", "nos vemos"],
        "weight": 4,
    },
    "pregunta_general": {
        "keywords": [
            "déjame pensarlo",
            "espera",
            "pregunta",
            "saber si",
            "me puedes decir",
            "aceptan",
            "seguro",
            "isapre",
            "fonasa",
            "convenio",
            "precio",
            "costo",
            "valor",
            "donde",
            "ubicado",
            "hora",
            "cierran",
            "abren",
            "documentos",
        ],
        "weight": 3,
    },
    "activar_recordatorios": {
        "keywords": [
            "activar recordatorio",
            "activar recordatorios",
            "activar notificación",
            "activar notificaciones",
            "quiero recordatorio",
            "activar aviso",
            "activar alerta",
            "activa recordatorio",
            "activa mis recordatorios",
            "activa mis recordatorio",
            "activa notificacion",
            "activa notificaciones",
            "quiero que me avisen",
            "activa aviso",
            "activa alerta",
        ],
        "weight": 4,
    },
    "desactivar_recordatorios": {
        "keywords": [
            "desactivar recordatorio",
            "desactivar recordatorios",
            "desactivar notificación",
            "desactivar notificaciones",
            "no quiero recordatorio",
            "quitar recordatorio",
            "no me avisen",
            "silenciar recordatorio",
            "desactiva recordatorio",
            "desactiva mis recordatorios",
            "desactiva notificacion",
            "desactiva notificaciones",
            "no quiero avisos",
            "desactiva aviso",
            "quitar aviso",
            "silenciar aviso",
        ],
        "weight": 4,
    },
    "preferencias_recordatorio": {
        "keywords": [
            "preferencia de recordatorio",
            "configurar recordatorio",
            "preferencias de notificación",
            "cómo configuro recordatorios",
            "ajustes de recordatorio",
            "personalizar recordatorio",
            "preferencias de recordatorio",
            "configurar notificacion",
            "cambiar mis preferencias de aviso",
            "ajustes de aviso",
            "configurar aviso",
            "como configuro",
            "como activo",
            "donde cambio",
        ],
        "weight": 4,
    },
    "mostrar_menu_principal": {
        "keywords": [
            "menu principal",
            "menu",
            "inicio",
            "opciones",
            "volver al inicio",
            "volver al menu",
            "mostrar menu",
            "que puedo hacer",
            "ayuda",
        ],
        "weight": 4,
    },
    "paso_wizard": {
        "keywords": [
            "siguiente",
            "continuar",
            "adelante",
            "confirmar cita",
            "si confirmar",
            "elegir otro",
            "otro horario",
            "otro dia",
            "volver",
            "atras",
            "cancelar wizard",
            "siguiente paso",
            "confirmo",
            "si quiero",
        ],
        "weight": 4,
    },
}

NORMALIZATION_MAP: Final[dict[str, str]] = {
    "ajendar": "agendar",
    "sita": "cita",
    "kita": "cita",
    "reserbar": "reservar",
    "reserba": "reserva",
    "kanselar": "cancelar",
    "kansela": "cancela",
    "cancelsr": "cancelar",
    "canelar": "cancelar",
    "kambiar": "cambiar",
    "kambia": "cambia",
    "disponiblidad": "disponibilidad",
    "disponible": "disponible",
    "disponibilidaz": "disponibilidad",
    "konsulta": "consulta",
    "konsulto": "consulto",
    "cosulta": "consulta",
    "ora": "hora",
    "oras": "horas",
    "lugr": "lugar",
    "lugare": "lugar",
    "truno": "turno",
    "trunos": "turnos",
    "urjente": "urgente",
    "urjencia": "urgencia",
    "urgnete": "urgente",
    "reporgramar": "reprogramar",
    "anualr": "anular",
    "resera": "reserva",
    "agnedar": "agendar",
    "resevar": "reservar",
    "nececito": "necesito",
    "hor": "hora",
    "grasias": "gracias",
    "ola": "hola",
    "holaa": "hola",
    "chao": "chau",
    "adios": "adiós",
    "qiero": "quiero",
    "kiero": "quiero",
    "wena": "buena",
    "bacan": "bacán",
    "agendame": "agendar",
    "kancelo": "cancelo",
    "kambio": "cambio",
    "orita": "ahora",
    "lune": "lunes",
    "miercole": "miércoles",
    "jueve": "jueves",
    "vierne": "viernes",
    "bieres": "viernes",
    "saba": "sábado",
    "domin": "domingo",
    "mediodia": "mediodía",
    "madrugada": "madrugada",
    "antier": "anteayer",
    "chequeo": "consulta general",
    "revision": "consulta general",
    "examen": "laboratorio",
    "lab": "laboratorio",
}

PROFANITY_TO_IGNORE: Final[list[str]] = ["carajo", "puta", "puto", "mierda", "coño", "joder", "boludo", "pelotudo"]

OFF_TOPIC_PATTERNS: Final[list[str]] = [
    "¿qué tiempo hace",
    "que tiempo hace",
    "cómo está el clima",
    "como esta el clima",
    "¿cuál es la capital",
    "cual es la capital",
    "¿dónde queda",
    "donde queda",
    "¿me puedes contar",
    "¿me puedes decir",
    "¿sabes",
    "¿puedes decirme",
    "¿qué hora es",
    "que hora es",
    "¿tienes hora",
    "tienes hora",
    "¿quién es el",
    "quien es el",
    "¿quién ganó",
    "quien gano",
    "¿cómo se hace",
    "como se hace",
    "¿cómo hacer",
    "como hacer",
    "¿qué películas",
    "que peliculas",
    "¿qué series",
    "que series",
    "¿cuánto es",
    "cuanto es",
    "¿cuánto cuesta",
    "cuanto cuesta",
    "¿dónde está",
    "donde esta",
    "¿dónde queda",
    "donde queda",
    "¿qué equipo",
    "que equipo",
    "¿quién gana",
    "quien gana",
    "chiste",
    "broma",
    "acertijo",
    "adivinanza",
    "receta",
    "cocinar",
    "preparar",
    "cómo hacer",
    "como hacer",
    "noticias",
    "periódico",
    "diario",
    "prensa",
    "fútbol",
    "película",
    "cine",
    "tele",
    "televisión",
    "presidente",
    "gobierno",
    "política",
    "economia",
]

GREETINGS: Final[list[str]] = ["hola", "holaa", "ola", "saludos"]
GREETING_PHRASES: Final[list[str]] = ["buenos días", "buenas tardes", "buenas noches", "buen día", "qué tal"]
FAREWELLS: Final[list[str]] = ["chau", "chao", "adiós", "adios"]
FAREWELL_PHRASES: Final[list[str]] = ["hasta luego", "nos vemos", "hasta pronto"]
THANK_YOU_WORDS: Final[list[str]] = ["gracias", "agradezco", "te agradezco", "mil gracias"]

URGENCY_WORDS: Final[list[str]] = [
    "urgente",
    "emergencia",
    "urgencia",
    "ya mismo",
    "ahora mismo",
    "inmediato",
    "dolor",
    "sangrando",
    "duele",
    "no puedo esperar",
]
FLEXIBILITY_KEYWORDS: Final[list[str]] = [
    "cualquier",
    "lo que tengas",
    "lo que conviene",
    "lo que más conviene",
    "indistinto",
    "flexible",
    "lo que tengas disponible",
]

DAY_NAMES: Final[dict[str, str]] = {
    "lunes": "monday",
    "martes": "tuesday",
    "miércoles": "wednesday",
    "miercoles": "wednesday",
    "jueves": "thursday",
    "viernes": "friday",
    "sábado": "saturday",
    "sabado": "saturday",
    "domingo": "sunday",
}

RELATIVE_DATES: Final[list[str]] = [
    "hoy",
    "mañana",
    "manana",
    "pasado mañana",
    "pasado manana",
    "esta semana",
    "próxima semana",
    "la semana que viene",
]

SERVICE_TYPES: Final[list[str]] = [
    "consulta general",
    "cardiología",
    "cardiologia",
    "pediatría",
    "pediatria",
    "dermatología",
    "dermatologia",
    "ginecología",
    "ginecologia",
    "psicología",
    "psicologia",
    "odontología",
    "odontologia",
    "limpieza",
    "rayos x",
    "laboratorio",
    "análisis",
    "analisis",
]


class EscalationThresholdsStruct(TypedDict):
    medical_emergency_min: float
    priority_queue_max: float
    human_handoff_max: float
    tfidf_minimum: float


ESCALATION_THRESHOLDS: Final[EscalationThresholdsStruct] = {
    "medical_emergency_min": 0.8,
    "priority_queue_max": 0.6,
    "human_handoff_max": 0.4,
    "tfidf_minimum": 0.4,
}


class RuleConfidenceStruct(TypedDict):
    urgencia_medical: float
    reminder_rule: float
    reschedule_rule: float
    cancel_rule: float
    availability_rule: float
    desconocido: float


RULE_CONFIDENCE_VALUES: Final[RuleConfidenceStruct] = {
    "urgencia_medical": 0.9,
    "reminder_rule": 0.85,
    "reschedule_rule": 0.8,
    "cancel_rule": 0.8,
    "availability_rule": 0.7,
    "desconocido": 0.1,
}


class SocialConfidenceStruct(TypedDict):
    greeting_exact: float
    greeting_phrase: float
    farewell_exact: float
    farewell_phrase: float
    thank_you: float
    off_topic: float


SOCIAL_CONFIDENCE_VALUES: Final[SocialConfidenceStruct] = {
    "greeting_exact": 0.95,
    "greeting_phrase": 0.9,
    "farewell_exact": 0.95,
    "farewell_phrase": 0.9,
    "thank_you": 0.95,
    "off_topic": 0.85,
}


class ConfidenceBoundariesStruct(TypedDict):
    HIGH_MIN: float
    MODERATE_MIN: float
    MODERATE_MAX: float
    LOW_MAX: float


CONFIDENCE_BOUNDARIES: Final[ConfidenceBoundariesStruct] = {
    "HIGH_MIN": 0.85,
    "MODERATE_MIN": 0.60,
    "MODERATE_MAX": 0.85,
    "LOW_MAX": 0.60,
}
