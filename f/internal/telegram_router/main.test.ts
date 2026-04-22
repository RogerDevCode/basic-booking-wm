import { describe, test, expect } from 'vitest';
import { main } from './main';

describe('Telegram Router — Callback routing', () => {
  test('cnf: booking callback', async () => {
    const result = await main({
      chat_id: '12345',
      callback_data: 'cnf:abc-123-def',
    });
    expect(result.error).toBeNull();
    expect(result).not.toBeNull();
    expect(result.data!.forward_to_ai).toBe(false);
    expect(result.data!.route).toBe('callback');
    expect(result.data!.callback_action).toBe('cnf');
    expect(result.data!.callback_booking_id).toBe('abc-123-def');
    expect(result.data!.response_text).toContain('confirmada');
  });

  test('cxl: cancel callback', async () => {
    const result = await main({ chat_id: '12345', callback_data: 'cxl:xyz-789' });
    expect(result.error).toBeNull();
    expect(result.data!.callback_action).toBe('cxl');
    expect(result.data!.response_text).toContain('cancelada');
  });

  test('res: reschedule callback', async () => {
    const result = await main({ chat_id: '12345', callback_data: 'res:' });
    expect(result.error).toBeNull();
    expect(result.data!.callback_action).toBe('res');
    expect(result.data!.response_text).toContain('reagendar');
  });

  test('act: activate reminders', async () => {
    const result = await main({ chat_id: '12345', callback_data: 'act:' });
    expect(result.error).toBeNull();
    expect(result.data!.callback_action).toBe('act');
    expect(result.data!.response_text).toContain('activados');
  });

  test('dea: deactivate reminders', async () => {
    const result = await main({ chat_id: '12345', callback_data: 'dea:' });
    expect(result.error).toBeNull();
    expect(result.data!.callback_action).toBe('dea');
    expect(result.data!.response_text).toContain('desactivados');
  });
});

describe('Telegram Router — Command routing', () => {
  test('/start command', async () => {
    const result = await main({ chat_id: '12345', text: '/start' });
    expect(result.error).toBeNull();
    expect(result.data!.route).toBe('command');
    expect(result.data!.forward_to_ai).toBe(false);
    expect(result.data!.response_text).toContain('Bienvenido');
    expect(result.data!.response_text).toContain('¿Qué deseas hacer?');
  });

  test('/admin command', async () => {
    const result = await main({ chat_id: '12345', text: '/admin' });
    expect(result.error).toBeNull();
    expect(result.data!.route).toBe('command');
    expect(result.data!.response_text).toContain('administración');
  });

  test('/provider command', async () => {
    const result = await main({ chat_id: '12345', text: '/provider' });
    expect(result.error).toBeNull();
    expect(result.data!.route).toBe('command');
    expect(result.data!.response_text).toContain('proveedor');
  });

  test('command case insensitive', async () => {
    const result = await main({ chat_id: '12345', text: '  /START  ' });
    expect(result.error).toBeNull();
    expect(result.data!.forward_to_ai).toBe(false);
  });
});

describe('Telegram Router — Menu routing', () => {
  test('Agendar cita (text) → starts booking wizard', async () => {
    const result = await main({ chat_id: '12345', text: 'Agendar cita' });
    expect(result.error).toBeNull();
    // Now starts wizard (wizard route) or falls back to menu without DB
    expect(['wizard', 'menu']).toContain(result.data!.route);
  });

  test('Mis citas (text)', async () => {
    const result = await main({ chat_id: '12345', text: 'Mis citas' });
    expect(result.error).toBeNull();
    expect(result.data!.menu_action).toBe('my_bookings');
  });

  test('Recordatorios (text)', async () => {
    const result = await main({ chat_id: '12345', text: 'Recordatorios' });
    expect(result.error).toBeNull();
    expect(result.data!.menu_action).toBe('reminders');
  });

  test('Numeric shortcut 1 → starts booking wizard', async () => {
    const result = await main({ chat_id: '12345', text: '1' });
    expect(result.error).toBeNull();
    // "1" now initiates the booking wizard
    expect(['wizard', 'menu']).toContain(result.data!.route);
  });

  test('Numeric shortcut 3', async () => {
    const result = await main({ chat_id: '12345', text: '3' });
    expect(result.error).toBeNull();
    expect(result.data!.menu_action).toBe('reminders');
  });
});

describe('Telegram Router — Submenu routing', () => {
  test('Volver al menu', async () => {
    const result = await main({ chat_id: '12345', text: 'Volver al menu' });
    expect(result.error).toBeNull();
    expect(result.data!.route).toBe('submenu');
    expect(result.data!.response_text).toContain('Menú Principal');
  });

  test('Configurar preferencias', async () => {
    const result = await main({ chat_id: '12345', text: 'Configurar preferencias' });
    expect(result.error).toBeNull();
    expect(result.data!.menu_action).toBe('reminder_prefs');
  });

  test('Ver proximas', async () => {
    const result = await main({ chat_id: '12345', text: 'Ver proximas' });
    expect(result.error).toBeNull();
    expect(result.data!.menu_action).toBe('upcoming_bookings');
  });
});

describe('Telegram Router — Fallback to AI Agent', () => {
  test('Free text goes to AI Agent', async () => {
    const result = await main({
      chat_id: '12345',
      text: 'Hola, necesito una cita para el lunes por la mañana',
    });
    expect(result.error).toBeNull();
    expect(result.data!.route).toBe('ai_agent');
    expect(result.data!.forward_to_ai).toBe(true);
    expect(result.data!.response_text).toBe('');
    expect(result.data!.callback_action).toBeNull();
    expect(result.data!.menu_action).toBeNull();
  });

  test('Question goes to AI Agent', async () => {
    const result = await main({ chat_id: '12345', text: '¿Aceptan Isapre?' });
    expect(result.error).toBeNull();
    expect(result.data!.forward_to_ai).toBe(true);
  });

  test('Reschedule request goes to AI Agent', async () => {
    const result = await main({ chat_id: '12345', text: 'Puedo cambiar mi cita del martes al jueves?' });
    expect(result.error).toBeNull();
    expect(result.data!.forward_to_ai).toBe(true);
  });

  test('Urgency goes to AI Agent', async () => {
    const result = await main({ chat_id: '12345', text: 'Tengo un dolor muy fuerte en el pecho' });
    expect(result.error).toBeNull();
    expect(result.data!.forward_to_ai).toBe(true);
  });
});

describe('Telegram Router — Priority order', () => {
  test('Callback data takes priority over text', async () => {
    const result = await main({
      chat_id: '12345',
      text: '/start',
      callback_data: 'cnf:booking-uuid',
    });
    expect(result.error).toBeNull();
    expect(result.data!.route).toBe('callback');
    expect(result.data!.callback_action).toBe('cnf');
  });

  test('Command takes priority over menu text', async () => {
    const result = await main({ chat_id: '12345', text: '/start' });
    expect(result.error).toBeNull();
    expect(result.data!.route).toBe('command');
    expect(result.data!.route).not.toBe('menu');
  });
});

describe('Telegram Router — Input validation', () => {
  test('Missing chat_id fails', async () => {
    const result = await main({ text: 'hello' });
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  test('Null text + null callback → AI Agent', async () => {
    const result = await main({ chat_id: '12345' });
    expect(result.error).toBeNull();
    expect(result.data!.forward_to_ai).toBe(true);
  });
});
