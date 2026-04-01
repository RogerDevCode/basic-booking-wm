import { main, detectContext, exactEntities } from './f/internal/ai_agent/main';

async function run(name: string, text: string) {
  const r = await main({ chat_id: '1', text });
  console.log(`[${name}] Intent: ${r.data?.intent}, Suggestion: ${r.data?.suggested_response_type}, Date: ${r.data?.entities?.date}, Is_Specific: ${r.data?.context?.is_specific_date}`);
}

run('T2', 'Quiero ver disponibilidad para el 15/04');
run('T3', 'Busco hora los martes por la tarde');
run('T4', 'Para el 2026-04-20');
run('T5', 'Con el proveedor 5');
run('T6', 'Para el servicio 3');
run('T12', 'Quiero agendar, me sirve cualquier día');
run('T13', 'Necesito hora el martes por la tarde');
