// AI Agent - Equivalente a NN_03_AI_Agent de n8n
// Detecta la intención del usuario y extrae entidades para booking

export interface AIAgentInput {
  chat_id: string;
  text: string;
}

export interface AIAgentEntities {
  provider_id?: string;
  service_id?: string;
  start_time?: string;
  date?: string;
  time?: string;
}

export interface AIAgentData {
  intent: string;
  chat_id: string;
  entities: AIAgentEntities;
  confidence: number;
  ai_response?: string;
}

export interface AIAgentResponse {
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  data: AIAgentData | null;
  _meta: {
    source: string;
    timestamp: string;
    workflow_id: string;
    version: string;
  };
}

// Intent types detected by AI
const INTENTS = {
  CREATE_APPOINTMENT: 'create_appointment',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  RESCHEDULE_APPOINTMENT: 'reschedule_appointment',
  CHECK_AVAILABILITY: 'check_availability',
  LIST_PROVIDERS: 'list_providers',
  LIST_SERVICES: 'list_services',
  GREETING: 'greeting',
  FAREWELL: 'farewell',
  THANK_YOU: 'thank_you',
  UNKNOWN: 'unknown'
};

// Keywords for intent detection (simple rule-based)
const INTENT_KEYWORDS: Record<string, string[]> = {
  [INTENTS.CREATE_APPOINTMENT]: ['reservar', 'agendar', 'citar', 'crear', 'nueva', 'nuevo', 'quiero', 'deseo', 'para'],
  [INTENTS.CANCEL_APPOINTMENT]: ['cancelar', 'anular', 'eliminar', 'borrar'],
  [INTENTS.RESCHEDULE_APPOINTMENT]: ['reprogramar', 'cambiar', 'mover', 'trasladar'],
  [INTENTS.CHECK_AVAILABILITY]: ['disponibilidad', 'disponible', 'hueco', 'espacio', 'libre'],
  [INTENTS.LIST_PROVIDERS]: ['proveedores', 'profesionales', 'doctores', 'médicos'],
  [INTENTS.LIST_SERVICES]: ['servicios', 'tratamientos', 'procedimientos'],
  [INTENTS.GREETING]: ['hola', 'buenos', 'buenas', 'saludos'],
  [INTENTS.FAREWELL]: ['adiós', 'chao', 'hasta', 'nos vemos'],
  [INTENTS.THANK_YOU]: ['gracias', 'agradezco']
};

export async function main(input: AIAgentInput): Promise<AIAgentResponse> {
  const source = "NN_03_AI_Agent";
  const workflowID = "ai-agent-v1";
  const version = "1.0.0";

  const { chat_id, text } = input;

  // Validate input
  if (!chat_id || !text || text.trim().length === 0) {
    return {
      success: false,
      error_code: 'VALIDATION_ERROR',
      error_message: 'chat_id and text are required',
      data: null,
      _meta: { source, timestamp: new Date().toISOString(), workflow_id: workflowID, version }
    };
  }

  // === INTENT DETECTION (Rule-based for now, can be enhanced with LLM) ===
  const textLower = text.toLowerCase();
  let detectedIntent = INTENTS.UNKNOWN;
  let maxScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const score = keywords.filter(kw => textLower.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      detectedIntent = intent;
    }
  }

  // === ENTITY EXTRACTION ===
  const entities: AIAgentEntities = {};

  // Extract provider_id (look for numbers or provider names)
  const providerMatch = textLower.match(/proveedor\s*(\d+)/i) || textLower.match(/(\d+)\s*(proveedor)/i);
  if (providerMatch) {
    entities.provider_id = providerMatch[1];
  }

  // Extract service_id
  const serviceMatch = textLower.match(/servicio\s*(\d+)/i) || textLower.match(/(\d+)\s*(servicio)/i);
  if (serviceMatch) {
    entities.service_id = serviceMatch[1];
  }

  // Extract date/time (simple patterns)
  const datePatterns = [
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,  // DD/MM/YYYY or DD-MM-YYYY
    /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,     // YYYY-MM-DD
    /(mañana|manana|hoy|pasado\s*mañana)/i   // Relative dates
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      entities.date = match[1];
      break;
    }
  }

  // Extract time
  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(am|pm)?)/i,
    /(\d{1,2}\s*(am|pm))/i
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      entities.time = match[1];
      entities.start_time = match[1];
      break;
    }
  }

  // === GENERATE AI RESPONSE ===
  let aiResponse: string;
  const confidence = maxScore > 0 ? Math.min(maxScore / 3, 1.0) : 0.3;

  switch (detectedIntent) {
    case INTENTS.CREATE_APPOINTMENT:
      aiResponse = `✅ Entendido! Quieres agendar una cita. ${entities.date ? `Para ${entities.date}` : ''} ${entities.time ? `a las ${entities.time}` : ''}. Por favor confirma los detalles.`;
      break;
    case INTENTS.CANCEL_APPOINTMENT:
      aiResponse = `❌ Veo que quieres cancelar una cita. Por favor proporciona el ID de reserva o más detalles.`;
      break;
    case INTENTS.RESCHEDULE_APPOINTMENT:
      aiResponse = `🔄 Quieres reprogramar tu cita. Cuál sería la nueva fecha y hora?`;
      break;
    case INTENTS.CHECK_AVAILABILITY:
      aiResponse = `📅 Déjame verificar la disponibilidad. ${entities.date ? `Para ${entities.date}` : 'Para qué fecha te gustaría?'}`;
      break;
    case INTENTS.GREETING:
      aiResponse = `👋 Hola! Bienvenido! En qué puedo ayudarte hoy?`;
      break;
    case INTENTS.THANK_YOU:
      aiResponse = `😊 De nada! Estoy aquí para ayudarte. Algo más en lo que pueda asistirte?`;
      break;
    case INTENTS.FAREWELL:
      aiResponse = `👋 Hasta luego! Que tengas un excelente día!`;
      break;
    default:
      aiResponse = `🤔 No estoy seguro de entender. Puedes ser más específico? Ej: "Quiero reservar una cita para mañana a las 3pm"`;
  }

  return {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      intent: detectedIntent,
      chat_id,
      entities,
      confidence,
      ai_response: aiResponse
    },
    _meta: { source, timestamp: new Date().toISOString(), workflow_id: workflowID, version }
  };
}
