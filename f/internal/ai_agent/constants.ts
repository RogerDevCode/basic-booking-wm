// ============================================================================
// INTENT CONSTANTS — Single Source of Truth (v3)
// Unifica nombres de intents para todo el sistema AI Agent
// ============================================================================

export const INTENT = {
  CREAR_CITA: 'crear_cita',
  CANCELAR_CITA: 'cancelar_cita',
  REAGENDAR: 'reagendar',
  CONSULTAR_DISPONIBILIDAD: 'consultar_disponibilidad',
  URGENCIA: 'urgencia',
  PREGUNTA_GENERAL: 'pregunta_general',
  SALUDO: 'saludo',
  DESPEDIDA: 'despedida',
  AGRADECIMIENTO: 'agradecimiento',
  ACTIVAR_RECORDATORIOS: 'activar_recordatorios',
  DESACTIVAR_RECORDATORIOS: 'desactivar_recordatorios',
  PREFERENCIAS_RECORDATORIO: 'preferencias_recordatorio',
  MOSTRAR_MENU_PRINCIPAL: 'mostrar_menu_principal',
  PASO_WIZARD: 'paso_wizard',
  VER_MIS_CITAS: 'ver_mis_citas',
  DESCONOCIDO: 'desconocido',
} as const;

export type IntentType = (typeof INTENT)[keyof typeof INTENT];

// ============================================================================
// CONFIDENCE THRESHOLDS
// Umbrales realistas por intent (basados en 100 tests de validación)
// ============================================================================

export const CONFIDENCE_THRESHOLDS: Record<IntentType, number> = {
  [INTENT.URGENCIA]: 0.5,
  [INTENT.CANCELAR_CITA]: 0.5,
  [INTENT.REAGENDAR]: 0.5,
  [INTENT.CREAR_CITA]: 0.3,
  [INTENT.CONSULTAR_DISPONIBILIDAD]: 0.3,
  [INTENT.SALUDO]: 0.5,
  [INTENT.DESPEDIDA]: 0.5,
  [INTENT.AGRADECIMIENTO]: 0.5,
  [INTENT.PREGUNTA_GENERAL]: 0.5,
  [INTENT.ACTIVAR_RECORDATORIOS]: 0.5,
  [INTENT.DESACTIVAR_RECORDATORIOS]: 0.5,
  [INTENT.PREFERENCIAS_RECORDATORIO]: 0.5,
  [INTENT.MOSTRAR_MENU_PRINCIPAL]: 0.5,
  [INTENT.PASO_WIZARD]: 0.5,
  [INTENT.VER_MIS_CITAS]: 0.5,
  [INTENT.DESCONOCIDO]: 0.0,
};

// ============================================================================
// INTENT KEYWORDS + WEIGHTS (para fallback rule-based)
// ============================================================================

export const INTENT_KEYWORDS: Record<string, { readonly keywords: readonly string[]; readonly weight: number }> = {
  [INTENT.URGENCIA]: {
    keywords: ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'no puedo esperar', 'urjente', 'urgnete', 'urjencia', 'nececito atencion', 'necesito atencion', 'necesito atencion ya', 'atencion urgente', 'atencion de emergencia'],
    weight: 10,
  },
  [INTENT.CANCELAR_CITA]: {
    keywords: ['cancelar', 'anular', 'eliminar', 'borrar', 'dar de baja', 'no necesito', 'kanselar', 'cancelsr', 'anualr', 'no voy a poder', 'no voy a ir', 'ya no voy', 'cambié de opinión', 'cancela todo', 'no iré'],
    weight: 4,
  },
  [INTENT.REAGENDAR]: {
    keywords: ['reprogramar', 'reagendar', 'cambiar', 'mover', 'trasladar', 'pasar', 'modificar', 'reporgramar', 'mejor para', 'me equivoqué de hora', 'otro día', 'para otro'],
    weight: 4,
  },
  [INTENT.CONSULTAR_DISPONIBILIDAD]: {
    keywords: ['disponibilidad', 'disponible', 'hueco', 'espacio', 'libre', 'tienen', 'lugar', 'horario', 'busco', 'atiende los', 'atiende los sábados'],
    weight: 3,
  },
  [INTENT.CREAR_CITA]: {
    keywords: ['reservar', 'agendar', 'cita', 'turno', 'sacar', 'pedir hora', 'necesito hora', 'consulta', 'visita', 'ver al doctor', 'ajendar', 'konsulta', 'cosulta', 'resevar', 'reserba', 'truno', 'sita', 'chequeo general', 'sacarme la muela', 'dolor de guata', 'la hora con el doctor', 'que me den la hora', 'pasado mañana', 'próximo bisiesto', 'medianoche', 'estaba agendando', 'agenda'],
    weight: 3,
  },
  [INTENT.VER_MIS_CITAS]: {
    keywords: ['confirmame la cita', 'mis citas', 'mi cita', 'confirmación', 'no me llegó', 'no fui a mi cita', 'ya completé', 'certificado', 'pendiente', 'atendido', 'me cobraron', 'reprogramada automáticamente', 'tengo alguna cita', 'tengo cita', 'mi hora', 'tengo turno', 'cuando es mi hora', 'ver mis citas', 'revisar mis citas'],
    weight: 4,
  },
  [INTENT.DESPEDIDA]: {
    keywords: ['mejor no quiero', 'gracias', 'adiós', 'chao', 'chau', 'hasta luego', 'nos vemos'],
    weight: 4,
  },
  [INTENT.PREGUNTA_GENERAL]: {
    keywords: ['déjame pensarlo', 'espera', 'pregunta', 'saber si', 'me puedes decir', 'aceptan', 'seguro', 'isapre', 'fonasa', 'convenio', 'precio', 'costo', 'valor', 'donde', 'ubicado', 'hora', 'cierran', 'abren', 'documentos'],
    weight: 3,
  },
  [INTENT.ACTIVAR_RECORDATORIOS]: {
    keywords: ['activar recordatorio', 'activar recordatorios', 'activar notificación', 'activar notificaciones', 'quiero recordatorio', 'activar aviso', 'activar alerta', 'activa recordatorio', 'activa mis recordatorios', 'activa mis recordatorio', 'activa notificacion', 'activa notificaciones', 'quiero que me avisen', 'activa aviso', 'activa alerta'],
    weight: 4,
  },
  [INTENT.DESACTIVAR_RECORDATORIOS]: {
    keywords: ['desactivar recordatorio', 'desactivar recordatorios', 'desactivar notificación', 'desactivar notificaciones', 'no quiero recordatorio', 'quitar recordatorio', 'no me avisen', 'silenciar recordatorio', 'desactiva recordatorio', 'desactiva mis recordatorios', 'desactiva notificacion', 'desactiva notificaciones', 'no quiero avisos', 'desactiva aviso', 'quitar aviso', 'silenciar aviso'],
    weight: 4,
  },
  [INTENT.PREFERENCIAS_RECORDATORIO]: {
    keywords: ['preferencia de recordatorio', 'configurar recordatorio', 'preferencias de notificación', 'cómo configuro recordatorios', 'ajustes de recordatorio', 'personalizar recordatorio', 'preferencias de recordatorio', 'configurar notificacion', 'cambiar mis preferencias de aviso', 'ajustes de aviso', 'configurar aviso', 'como configuro', 'como activo', 'donde cambio'],
    weight: 4,
  },
  [INTENT.MOSTRAR_MENU_PRINCIPAL]: {
    keywords: ['menu principal', 'menu', 'inicio', 'opciones', 'volver al inicio', 'volver al menu', 'mostrar menu', 'que puedo hacer', 'ayuda'],
    weight: 4,
  },
  [INTENT.PASO_WIZARD]: {
    keywords: ['siguiente', 'continuar', 'adelante', 'confirmar cita', 'si confirmar', 'elegir otro', 'otro horario', 'otro dia', 'volver', 'atras', 'cancelar wizard', 'siguiente paso', 'confirmo', 'si quiero'],
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

export const URGENCY_WORDS = ['urgente', 'emergencia', 'urgencia', 'ya mismo', 'ahora mismo', 'inmediato', 'dolor', 'sangrando', 'duele', 'no puedo esperar'];

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
