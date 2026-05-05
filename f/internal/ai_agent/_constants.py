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
