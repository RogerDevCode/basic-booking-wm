// ============================================================================
// INTENT CONSTANTS — Single Source of Truth (v3)
// Unifica nombres de intents para todo el sistema AI Agent
// ============================================================================

export const INTENT = {
  CREATE_APPOINTMENT: 'create_appointment',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  RESCHEDULE: 'reschedule',
  CHECK_AVAILABILITY: 'check_availability',
  URGENT_CARE: 'urgent_care',
  GENERAL_QUESTION: 'general_question',
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  THANK_YOU: 'thank_you',
  ACTIVATE_REMINDERS: 'activate_reminders',
  DEACTIVATE_REMINDERS: 'deactivate_reminders',
  REMINDER_PREFERENCES: 'reminder_preferences',
  SHOW_MAIN_MENU: 'show_main_menu',
  WIZARD_STEP: 'wizard_step',
  GET_MY_BOOKINGS: 'get_my_bookings',
  UNKNOWN: 'unknown',
} as const;

export type IntentType = (typeof INTENT)[keyof typeof INTENT];

// ============================================================================
// CONFIDENCE THRESHOLDS
// Umbrales realistas por intent (basados en 100 tests de validación)
// ============================================================================

export const CONFIDENCE_THRESHOLDS: Record<IntentType, number> = {
  [INTENT.URGENT_CARE]: 0.5,
  [INTENT.CANCEL_APPOINTMENT]: 0.5,
  [INTENT.RESCHEDULE]: 0.5,
  [INTENT.CREATE_APPOINTMENT]: 0.3,
  [INTENT.CHECK_AVAILABILITY]: 0.3,
  [INTENT.GREETING]: 0.5,
  [INTENT.FAREWELL]: 0.5,
  [INTENT.THANK_YOU]: 0.5,
  [INTENT.GENERAL_QUESTION]: 0.5,
  [INTENT.ACTIVATE_REMINDERS]: 0.5,
  [INTENT.DEACTIVATE_REMINDERS]: 0.5,
  [INTENT.REMINDER_PREFERENCES]: 0.5,
  [INTENT.SHOW_MAIN_MENU]: 0.5,
  [INTENT.WIZARD_STEP]: 0.5,
  [INTENT.GET_MY_BOOKINGS]: 0.5,
  [INTENT.UNKNOWN]: 0.0,
};

// ============================================================================
// INTENT KEYWORDS + WEIGHTS (para fallback rule-based)
// ============================================================================

export const INTENT_KEYWORDS: Record<string, { readonly keywords: readonly string[]; readonly weight: number }> = {
  [INTENT.URGENT_CARE]: {
    keywords: ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'no puedo esperar', 'urjente', 'urgnete', 'urjencia', 'nececito atencion', 'necesito atencion', 'necesito atencion ya', 'atencion urgente', 'atencion de emergencia'],
    weight: 10,
  },
  [INTENT.CANCEL_APPOINTMENT]: {
    keywords: ['cancelar', 'anular', 'eliminar', 'borrar', 'dar de baja', 'no necesito', 'kanselar', 'cancelsr', 'anualr', 'no voy a poder', 'no voy a ir', 'ya no voy', 'cambié de opinión', 'cancela todo', 'no iré'],
    weight: 4,
  },
  [INTENT.RESCHEDULE]: {
    keywords: ['reprogramar', 'reagendar', 'cambiar', 'mover', 'trasladar', 'pasar', 'modificar', 'reporgramar', 'mejor para', 'me equivoqué de hora', 'otro día', 'para otro'],
    weight: 4,
  },
  [INTENT.CHECK_AVAILABILITY]: {
    keywords: ['disponibilidad', 'disponible', 'hueco', 'espacio', 'libre', 'tienen', 'lugar', 'horario', 'busco', 'atiende los', 'atiende los sábados'],
    weight: 3,
  },
  [INTENT.CREATE_APPOINTMENT]: {
    keywords: ['reservar', 'agendar', 'cita', 'turno', 'sacar', 'pedir hora', 'necesito hora', 'consulta', 'visita', 'ver al doctor', 'ajendar', 'konsulta', 'cosulta', 'resevar', 'reserba', 'truno', 'sita', 'chequeo general', 'sacarme la muela', 'dolor de guata', 'la hora con el doctor', 'que me den la hora', 'pasado mañana', 'próximo bisiesto', 'medianoche', 'estaba agendando'],
    weight: 3,
  },
  [INTENT.GET_MY_BOOKINGS]: {
    keywords: ['confirmame la cita', 'mis citas', 'mi cita', 'confirmación', 'no me llegó', 'no fui a mi cita', 'ya completé', 'certificado', 'pendiente', 'atendido', 'me cobraron', 'reprogramada automáticamente'],
    weight: 4,
  },
  [INTENT.FAREWELL]: {
    keywords: ['mejor no quiero', 'gracias', 'adiós', 'chao', 'chau', 'hasta luego', 'nos vemos'],
    weight: 4,
  },
  [INTENT.GENERAL_QUESTION]: {
    keywords: ['déjame pensarlo', 'espera', 'pregunta', 'saber si', 'me puedes decir'],
    weight: 3,
  },
  [INTENT.ACTIVATE_REMINDERS]: {
    keywords: ['activar recordatorio', 'activar recordatorios', 'activar notificación', 'activar notificaciones', 'quiero recordatorio', 'activar aviso', 'activar alerta', 'activa recordatorio', 'activa mis recordatorios', 'activa mis recordatorio', 'activa notificacion', 'activa notificaciones', 'quiero que me avisen', 'activa aviso', 'activa alerta'],
    weight: 4,
  },
  [INTENT.DEACTIVATE_REMINDERS]: {
    keywords: ['desactivar recordatorio', 'desactivar recordatorios', 'desactivar notificación', 'desactivar notificaciones', 'no quiero recordatorio', 'quitar recordatorio', 'no me avisen', 'silenciar recordatorio', 'desactiva recordatorio', 'desactiva mis recordatorios', 'desactiva notificacion', 'desactiva notificaciones', 'no quiero avisos', 'desactiva aviso', 'quitar aviso', 'silenciar aviso'],
    weight: 4,
  },
  [INTENT.REMINDER_PREFERENCES]: {
    keywords: ['preferencia de recordatorio', 'configurar recordatorio', 'preferencias de notificación', 'cómo configuro recordatorios', 'ajustes de recordatorio', 'personalizar recordatorio', 'preferencias de recordatorio', 'configurar notificacion', 'cambiar mis preferencias de aviso', 'ajustes de aviso', 'configurar aviso'],
    weight: 4,
  },
  [INTENT.SHOW_MAIN_MENU]: {
    keywords: ['menu principal', 'menu', 'inicio', 'opciones', 'volver al inicio', 'volver al menu', 'mostrar menu', 'que puedo hacer', 'ayuda'],
    weight: 4,
  },
  [INTENT.WIZARD_STEP]: {
    keywords: ['siguiente', 'continuar', 'adelante', 'confirmar cita', 'si confirmar', 'elegir otro', 'otro horario', 'otro dia', 'volver', 'atras', 'cancelar wizard'],
    weight: 4,
  },
};

// ============================================================================
// SPELLING NORMALIZATION MAP (40+ entries)
// Mapea errores ortográficos comunes → palabra correcta
// ============================================================================

export const NORMALIZATION_MAP: Record<string, string> = {
  'ajendar': 'agendar', 'sita': 'cita', 'kita': 'cita',
  'reserbar': 'reservar', 'reserba': 'reserva',
  'kanselar': 'cancelar', 'kansela': 'cancela', 'cancelsr': 'cancelar', 'canelar': 'cancelar',
  'kambiar': 'cambiar', 'kambia': 'cambia',
  'disponiblidad': 'disponibilidad', 'disponible': 'disponible', 'disponibilidaz': 'disponibilidad',
  'konsulta': 'consulta', 'konsulto': 'consulto', 'cosulta': 'consulta',
  'ora': 'hora', 'oras': 'horas',
  'lugr': 'lugar', 'lugare': 'lugar',
  'truno': 'turno', 'trunos': 'turnos',
  'urjente': 'urgente', 'urjencia': 'urgencia', 'urgnete': 'urgente',
  'reporgramar': 'reprogramar',
  'anualr': 'anular',
  'resera': 'reserva',
  'agnedar': 'agendar', 'resevar': 'reservar',
  'nececito': 'necesito', 'hor': 'hora',
  'grasias': 'gracias', 'ola': 'hola', 'holaa': 'hola',
  'chao': 'chau', 'adios': 'adiós',
  'qiero': 'quiero', 'kiero': 'quiero',
  'wena': 'buena', 'bacan': 'bacán',
  'agendame': 'agendar', 'kancelo': 'cancelo', 'kambio': 'cambio',
  'orita': 'ahora',
  'lune': 'lunes', 'miercole': 'miércoles', 'jueve': 'jueves',
  'vierne': 'viernes', 'bieres': 'viernes',
  'saba': 'sábado', 'domin': 'domingo',
  'mediodia': 'mediodía', 'madrugada': 'madrugada',
  'antier': 'anteayer',
  'chequeo': 'consulta general', 'revision': 'consulta general',
  'examen': 'laboratorio', 'lab': 'laboratorio',
};

// ============================================================================
// PROFANITY FILTER
// Palabras a ignorar/limpiar antes de clasificar intent
// ============================================================================

export const PROFANITY_TO_IGNORE = ['carajo', 'puta', 'puto', 'mierda', 'coño', 'joder', 'boludo', 'pelotudo'];

// ============================================================================
// OFF-TOPIC PATTERNS
// Patrones para detectar mensajes fuera del dominio médico
// ============================================================================

export const OFF_TOPIC_PATTERNS = [
  '¿qué tiempo hace', 'que tiempo hace', 'cómo está el clima', 'como esta el clima',
  '¿cuál es la capital', 'cual es la capital', '¿dónde queda', 'donde queda',
  '¿me puedes contar', '¿me puedes decir', '¿sabes', '¿puedes decirme',
  '¿qué hora es', 'que hora es', '¿tienes hora', 'tienes hora',
  '¿quién es el', 'quien es el', '¿quién ganó', 'quien gano',
  '¿cómo se hace', 'como se hace', '¿cómo hacer', 'como hacer',
  '¿qué películas', 'que peliculas', '¿qué series', 'que series',
  '¿cuánto es', 'cuanto es', '¿cuánto cuesta', 'cuanto cuesta',
  '¿dónde está', 'donde esta', '¿dónde queda', 'donde queda',
  '¿qué equipo', 'que equipo', '¿quién gana', 'quien gana',
  'chiste', 'broma', 'acertijo', 'adivinanza',
  'receta', 'cocinar', 'preparar', 'cómo hacer', 'como hacer',
  'noticias', 'periódico', 'diario', 'prensa',
  'fútbol', 'película', 'cine', 'tele', 'televisión',
  'presidente', 'gobierno', 'política', 'economia',
];

// ============================================================================
// GREETING / FAREWELL / THANK YOU LISTS
// Para fast-path detection (evita llamada LLM)
// ============================================================================

export const GREETINGS = ['hola', 'holaa', 'ola', 'saludos'];
export const GREETING_PHRASES = ['buenos días', 'buenas tardes', 'buenas noches', 'buen día', 'qué tal'];
export const FAREWELLS = ['chau', 'chao', 'adiós', 'adios'];
export const FAREWELL_PHRASES = ['hasta luego', 'nos vemos', 'hasta pronto'];
export const THANK_YOU_WORDS = ['gracias', 'agradezco', 'te agradezco', 'mil gracias'];

// ============================================================================
// URGENCY WORDS (para cross-check post-LLM)
// ============================================================================

export const URGENCY_WORDS = ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'no puedo esperar'];

// ============================================================================
// FLEXIBILITY KEYWORDS
// ============================================================================

export const FLEXIBILITY_KEYWORDS = ['cualquier', 'lo que tengas', 'lo que conviene', 'lo que más conviene', 'indistinto', 'flexible', 'lo que tengas disponible'];

// ============================================================================
// DAY NAMES (Spanish → English mapping)
// ============================================================================

export const DAY_NAMES: Record<string, string> = {
  'lunes': 'monday', 'martes': 'tuesday', 'miércoles': 'wednesday', 'miercoles': 'wednesday',
  'jueves': 'thursday', 'viernes': 'friday', 'sábado': 'saturday', 'sabado': 'saturday', 'domingo': 'sunday',
};

// ============================================================================
// RELATIVE DATES
// ============================================================================

export const RELATIVE_DATES = ['hoy', 'mañana', 'manana', 'pasado mañana', 'pasado manana', 'esta semana', 'próxima semana', 'la semana que viene'];

// ============================================================================
// SERVICE TYPES (para entity extraction)
// ============================================================================

export const SERVICE_TYPES = [
  'consulta general', 'cardiología', 'cardiologia', 'pediatría', 'pediatria',
  'dermatología', 'dermatologia', 'ginecología', 'ginecologia',
  'psicología', 'psicologia', 'odontología', 'odontologia',
  'limpieza', 'rayos x', 'laboratorio', 'análisis', 'analisis',
];
