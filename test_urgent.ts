import { main } from './f/internal/ai_agent/main';

void (async () => {
  const result = await main({ chat_id: '1', text: '¡Necesito una cita urgente, es una emergencia!' });
  console.log('Result 1:', result.data?.intent, result.data?.context.is_urgent, result.data?.suggested_response_type);

  const result2 = await main({ chat_id: '1', text: 'Quiero agendar una cita urgente para hoy' });
  console.log('Result 2:', result2.data?.intent, result2.data?.context.is_urgent, result2.data?.suggested_response_type);
})();
