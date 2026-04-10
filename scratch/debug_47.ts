import { main } from '../f/internal/ai_agent/main';

async function run() {
  process.env.AI_AGENT_LLM_MODE = 'test';
  
  const inputs = [
    "Ya completé mi cita, necesito el certificado",
    "Mi cita ya fue, pero no me marcaron como atendido", 
    "Mira, agendé una cita hace una semana pero no me llegó ningún...",
    "Buenas tardes, quiero cancelar la cita que tengo agendada para el viernes"
  ];
  
  for (const text of inputs) {
    const res = await main({ chat_id: "test", text });
    console.log(`[${text.substring(0, 30)}...] -> ${res.data?.intent} (conf: ${res.data?.confidence})`);
  }
}
run();
