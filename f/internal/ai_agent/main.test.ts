import { describe, test, expect } from "vitest";
// AI Agent v2.0 - Tests para las nuevas funcionalidades
// Test de detección de urgencia, contexto y sugerencia de respuestas

import { main } from './main';
import { AIAgentInput } from './types';

describe('AI Agent v2.0 - Enhanced Availability Context', () => {
  
  // ============================================================================
  // TESTS DE URGENCIA
  // ============================================================================
  
  describe('Urgency Detection', () => {
    test('Debe detectar urgencia con palabras clave explícitas', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¡Necesito una cita urgente, es una emergencia!'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.intent).toBe('urgencia');
      expect(result.data?.context.is_urgent).toBe(true);
      expect(result.data?.dialogue_act).toBe('offer');
      expect(result.data?.confidence).toBeGreaterThan(0.7);
    });
    
    test('Debe detectar urgencia con "ya mismo"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Necesito un turno ya mismo, tengo mucho dolor'
      };
      
      const result = await main(input);
      
      expect(result.data?.intent).toBe('urgencia');
      expect(result.data?.context.is_urgent).toBe(true);
    });
    
    test('Debe detectar urgencia combinada con booking', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero agendar una cita urgente para hoy'
      };
      
      const result = await main(input);
      
      // La urgencia debe priorizarse sobre el booking
      expect(result.data?.intent).toBe('urgencia');
      expect(result.data?.context.is_urgent).toBe(true);
      expect(result.data?.context.is_today).toBe(true);
    });
  });
  
  // ============================================================================
  // TESTS DE CONTEXTO - IS_TODAY
  // ============================================================================
  
  describe('Context Detection - Is Today', () => {
    test('Debe detectar "hoy" como is_today', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¿Tienen hora para hoy?'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.is_today).toBe(true);
      expect(result.data?.context.is_specific_date).toBe(true);
      expect(result.data?.entities.date).toBe('hoy');
    });
    
    test('Debe detectar "para hoy" como is_today', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero agendar para hoy'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.is_today).toBe(true);
    });
  });
  
  // ============================================================================
  // TESTS DE CONTEXTO - IS_TOMORROW
  // ============================================================================
  
  describe('Context Detection - Is Tomorrow', () => {
    test('Debe detectar "mañana" como is_tomorrow', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¿Tienen disponibilidad mañana?'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.is_tomorrow).toBe(true);
      expect(result.data?.entities.date).toBe('mañana');
    });
    
    test('Debe detectar "manana" (sin tilde) como is_tomorrow', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Puedo agendar para manana?'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.is_tomorrow).toBe(true);
    });
  });
  
  // ============================================================================
  // TESTS DE CONTEXTO - FLEXIBILIDAD
  // ============================================================================
  
  describe('Context Detection - Flexibility', () => {
    test('Debe detectar flexibilidad con "cualquier día"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Me sirve cualquier día, lo que tengas disponible'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.is_flexible).toBe(true);
      expect(result.data?.dialogue_act).toBe('offer');
    });
    
    test('Debe detectar flexibilidad con "lo que conviene"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Agendo lo que más conviene, soy flexible'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.is_flexible).toBe(true);
    });
  });
  
  // ============================================================================
  // TESTS DE PREFERENCIAS HORARIAS
  // ============================================================================
  
  describe('Time Preference Detection', () => {
    test('Debe detectar preferencia "morning"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Prefiero por la mañana, antes de las 12'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.time_preference).toBe('morning');
    });
    
    test('Debe detectar preferencia "afternoon"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Solo puedo por la tarde, después de las 17'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.time_preference).toBe('afternoon');
    });
    
    test('Debe detectar preferencia "evening"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Mejor por la noche, tipo 20:00'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.time_preference).toBe('evening');
    });
  });
  
  // ============================================================================
  // TESTS DE PREFERENCIAS DE DÍA
  // ============================================================================
  
  describe('Day Preference Detection', () => {
    test('Debe detectar "lunes"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero agendar para el lunes'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.day_preference).toBe('monday');
      expect(result.data?.context.is_specific_date).toBe(true);
    });
    
    test('Debe detectar "miércoles" (con tilde)', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Tienes disponibilidad el miércoles?'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.day_preference).toBe('wednesday');
    });
    
    test('Debe detectar "miercoles" (sin tilde)', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Puede ser el miercoles'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.day_preference).toBe('wednesday');
    });
    
    test('Debe detectar "viernes"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'El viernes por la tarde'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.day_preference).toBe('friday');
      expect(result.data?.context.time_preference).toBe('afternoon');
    });
  });
  
  // ============================================================================
  // TESTS DE SUGERENCIA DE TIPO DE RESPUESTA
  // ============================================================================
  
  describe('Suggested Response Type', () => {
    test('Debe sugerir "urgent_options" para urgencia', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¡Es urgente, necesito atención ya!'
      };
      
      const result = await main(input);
      
      expect(result.data?.dialogue_act).toBe('offer');
    });
    
    test('Debe sugerir "no_availability_today" para hoy', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¿Tienen hora para hoy?'
      };
      
      const result = await main(input);
      
      expect(result.data?.dialogue_act).toBe('inform');
    });
    
    test('Debe sugerir "availability_list" para fecha específica', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero ver disponibilidad para el 15/04'
      };
      
      const result = await main(input);
      
      expect(result.data?.dialogue_act).toBe('inform');
    });
    
    test('Debe sugerir "general_search" para búsqueda flexible', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero agendar, cualquier día me sirve'
      };
      
      const result = await main(input);
      
      expect(result.data?.dialogue_act).toBe('offer');
    });
    
    test('Debe sugerir "filtered_search" con preferencias', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Busco hora los martes por la tarde'
      };
      
      const result = await main(input);
      
      expect(result.data?.dialogue_act).toBe('offer');
    });
    
    test('Debe sugerir "clarifying_question" si faltan datos', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero agendar una cita'
      };
      
      const result = await main(input);
      
      expect(result.data?.dialogue_act).toBe('question');
      expect(result.data?.needs_more_info).toBe(true);
    });
  });
  
  // ============================================================================
  // TESTS DE RESPUESTAS DE AI
  // ============================================================================
  
  describe('AI Response Generation', () => {
    test('Debe generar respuesta apropiada para urgencia', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¡Necesito una cita urgente!'
      };
      
      const result = await main(input);
      
      expect(result.data?.ai_response).toContain('🚨');
      expect(result.data?.ai_response).toContain('urgente');
      expect(result.data?.ai_response).toContain('Lista de espera');
    });
    
    test('Debe generar respuesta apropiada para "hoy"', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¿Tienen hora para hoy?'
      };
      
      const result = await main(input);
      
      expect(result.data?.ai_response).toContain('hoy');
      expect(result.data?.ai_response).toContain('completamente reservados');
      expect(result.data?.ai_response).toContain('mañana');
    });
    
    test('Debe generar respuesta con follow_up cuando necesita más info', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero agendar una cita'
      };
      
      const result = await main(input);
      
      expect(result.data?.needs_more_info).toBe(true);
      expect(result.data?.follow_up).toBeDefined();
      expect(result.data?.follow_up?.length).toBeGreaterThan(10);
    });
    
    test('Debe generar respuesta de greeting apropiada', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Hola, buenos días'
      };
      
      const result = await main(input);
      
      expect(result.data?.ai_response).toContain('👋');
      expect(result.data?.ai_response).toContain('Hola');
      expect(result.data?.intent).toBe('saludo');
    });
  });
  
  // ============================================================================
  // TESTS DE EXTRACCIÓN DE ENTIDADES
  // ============================================================================
  
  describe('Entity Extraction', () => {
    test('Debe extraer fecha en formato DD/MM/YYYY', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero agendar para el 15/04/2026'
      };
      
      const result = await main(input);
      
      expect(result.data?.entities.date).toBe('15/04/2026');
    });
    
    test('Debe extraer fecha en formato YYYY-MM-DD', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Para el 2026-04-20'
      };
      
      const result = await main(input);
      
      expect(result.data?.entities.date).toBe('2026-04-20');
    });
    
    test('Debe extraer hora en formato HH:MM', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'A las 15:30'
      };
      
      const result = await main(input);
      
      expect(result.data?.entities.time).toBe('15:30');
    });
    
    test('Debe extraer hora con AM/PM', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Tipo 3:00 PM'
      };
      
      const result = await main(input);
      
      expect(result.data?.entities.time).toContain('3:00');
    });
    
    test('Debe extraer provider_id', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Con el proveedor 5'
      };
      
      const result = await main(input);
      
      expect(result.data?.entities.provider_id).toBe('5');
    });
    
    test('Debe extraer service_id', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Para el servicio 3'
      };
      
      const result = await main(input);
      
      expect(result.data?.entities.service_id).toBe('3');
    });
  });
  
  // ============================================================================
  // TESTS DE USUARIO CON HISTORIAL
  // ============================================================================
  
  describe('User Profile Context', () => {
    test('Debe dar bienvenida diferente a usuario primerizo', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Hola',
        user_profile: {
          is_first_time: true,
          booking_count: 0
        }
      };
      
      const result = await main(input);
      
      expect(result.data?.ai_response).toContain('Bienvenido');
      expect(result.data?.ai_response).toContain('primera vez');
    });
    
    test('Debe saludar diferente a usuario frecuente', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Hola',
        user_profile: {
          is_first_time: false,
          booking_count: 10
        }
      };
      
      const result = await main(input);
      
      expect(result.data?.ai_response).toContain('qué bueno verte de nuevo');
    });
  });
  
  // ============================================================================
  // TESTS DE VALIDACIÓN
  // ============================================================================
  
  describe('Input Validation', () => {
    test('Debe fallar con chat_id vacío', async () => {
      const input: AIAgentInput = {
        chat_id: '',
        text: 'Hola'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(false);
      expect(result.error_code).toBe('VALIDATION_ERROR');
    });
    
    test('Debe fallar con texto vacío', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: ''
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(false);
      expect(result.error_code).toBe('VALIDATION_ERROR');
    });
    
    test('Debe fallar con texto solo espacios', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '   '
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(false);
    });
  });
  
  // ============================================================================
  // TESTS DE ESCENARIOS COMPLETOS (INTEGRACIÓN)
  // ============================================================================
  
  describe('Complete Scenarios (Integration)', () => {
    test('Escenario: Usuario urgente sin disponibilidad hoy', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¡Necesito una cita urgente para hoy!'
      };
      
      const result = await main(input);
      
      // Verificar detección correcta
      expect(result.data?.intent).toBe('urgencia');
      expect(result.data?.context.is_urgent).toBe(true);
      expect(result.data?.context.is_today).toBe(true);
      expect(result.data?.dialogue_act).toBe('offer');
      
      // Verificar respuesta útil
      expect(result.data?.ai_response).toContain('urgente');
      expect(result.data?.ai_response).toContain('Lista de espera');
    });
    
    test('Escenario: Usuario flexible buscando disponibilidad', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero agendar, me sirve cualquier día'
      };
      
      const result = await main(input);
      
      expect(result.data?.intent).toBe('crear_cita');
      expect(result.data?.context.is_flexible).toBe(true);
      expect(result.data?.dialogue_act).toBe('offer');
      expect(result.data?.needs_more_info).toBe(true);
    });
    
    test('Escenario: Usuario con preferencia específica', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Necesito hora el martes por la tarde'
      };
      
      const result = await main(input);
      
      expect(result.data?.context.day_preference).toBe('tuesday');
      expect(result.data?.context.time_preference).toBe('afternoon');
      expect(result.data?.dialogue_act).toBe('offer');
    });
    
    test('Escenario: Reagendamiento', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero cambiar mi cita para otro día'
      };
      
      const result = await main(input);
      
      expect(result.data?.intent).toBe('reagendar');
      expect(result.data?.dialogue_act).toBe('request_action');
      expect(result.data?.needs_more_info).toBe(true);
      expect(result.data?.follow_up).toContain('reserva actual');
    });
  });

  // ============================================================================
  // TESTS DE RECORDATORIOS (Reminder Intents)
  // ============================================================================

  describe('Reminder Intents', () => {
    test('Debe detectar activate_reminders', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Activa mis recordatorios'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.intent).toBe('activar_recordatorios');
    });

    test('Debe detectar deactivate_reminders', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Desactiva mis recordatorios'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.intent).toBe('desactivar_recordatorios');
    });

    test('Debe detectar reminder_preferences', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: '¿Cómo configuro mis preferencias de recordatorio?'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.intent).toBe('preferencias_recordatorio');
    });

    test('Debe extraer canal de notificación', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero recibir avisos por Telegram pero no por email'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.entities.channel).toBe('telegram');
    });

    test('Debe extraer ventana de recordatorio 30min', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Activa mis recordatorios de 30min antes'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.entities.reminder_window).toBe('30min');
    });

    test('Debe generar respuesta para activate_reminders', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero que me avisen de mis citas'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.dialogue_act).toBe('confirm');
      expect(result.data?.ai_response).toContain('recordatorio');
    });

    test('Debe generar respuesta para deactivate_reminders', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Desactiva mis recordatorios'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.dialogue_act).toBe('confirm');
    });

    test('Debe generar respuesta con follow_up para reminder_preferences', async () => {
      const input: AIAgentInput = {
        chat_id: '123456',
        text: 'Quiero cambiar mis preferencias de aviso'
      };
      
      const result = await main(input);
      
      expect(result.success).toBe(true);
      expect(result.data?.dialogue_act).toBe('question');
      expect(result.data?.needs_more_info).toBe(true);
    });
  });
});
