import { describe, test, expect } from 'vitest';
import { main } from './main';

describe('Telegram Router — Callback routing', () => {
  test('cnf: booking callback', async () => {
    const [err, result] = await main({
      chat_id: '12345',
      callback_data: 'cnf:abc-123-def',
    });
    expect(err).toBeNull();
    expect(result).not.toBeNull();
    expect(result!.forward_to_ai).toBe(false);
    expect(result!.route).toBe('callback');
    expect(result!.callback_action).toBe('cnf');
    expect(result!.callback_booking_id).toBe('abc-123-def');
    expect(result!.response_text).toContain('confirmada');
  });

  test('cxl: cancel callback', async () => {
    const [err, result] = await main({ chat_id: '12345', callback_data: 'cxl:xyz-789' });
    expect(err).toBeNull();
    expect(result!.callback_action).toBe('cxl');
    expect(result!.response_text).toContain('cancelada');
  });

  test('res: reschedule callback', async () => {
    const [err, result] = await main({ chat_id: '12345', callback_data: 'res:' });
    expect(err).toBeNull();
    expect(result!.callback_action).toBe('res');
    expect(result!.response_text).toContain('reagendar');
  });

  test('act: activate reminders', async () => {
    const [err, result] = await main({ chat_id: '12345', callback_data: 'act:' });
    expect(err).toBeNull();
    expect(result!.callback_action).toBe('act');
    expect(result!.response_text).toContain('activados');
  });

  test('dea: deactivate reminders', async () => {
    const [err, result] = await main({ chat_id: '12345', callback_data: 'dea:' });
    expect(err).toBeNull();
    expect(result!.callback_action).toBe('dea');
    expect(result!.response_text).toContain('desactivados');
  });
});

describe('Telegram Router — Command routing', () => {
  test('/start command', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '/start' });
    expect(err).toBeNull();
    expect(result!.route).toBe('command');
    expect(result!.forward_to_ai).toBe(false);
    expect(result!.response_text).toContain('Bienvenido');
    expect(result!.response_text).toContain('1️⃣');
  });

  test('/admin command', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '/admin' });
    expect(err).toBeNull();
    expect(result!.route).toBe('command');
    expect(result!.response_text).toContain('administración');
  });

  test('/provider command', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '/provider' });
    expect(err).toBeNull();
    expect(result!.route).toBe('command');
    expect(result!.response_text).toContain('proveedor');
  });

  test('command case insensitive', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '  /START  ' });
    expect(err).toBeNull();
    expect(result!.forward_to_ai).toBe(false);
  });
});

describe('Telegram Router — Menu routing', () => {
  test('Agendar cita (text) → starts booking wizard', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Agendar cita' });
    expect(err).toBeNull();
    // Now starts wizard (wizard route) or falls back to menu without DB
    expect(['wizard', 'menu']).toContain(result!.route);
  });

  test('Mis citas (text)', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Mis citas' });
    expect(err).toBeNull();
    expect(result!.menu_action).toBe('my_bookings');
  });

  test('Recordatorios (text)', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Recordatorios' });
    expect(err).toBeNull();
    expect(result!.menu_action).toBe('reminders');
  });

  test('Numeric shortcut 1 → starts booking wizard', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '1' });
    expect(err).toBeNull();
    // "1" now initiates the booking wizard
    expect(['wizard', 'menu']).toContain(result!.route);
  });

  test('Numeric shortcut 3', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '3' });
    expect(err).toBeNull();
    expect(result!.menu_action).toBe('reminders');
  });
});

describe('Telegram Router — Submenu routing', () => {
  test('Volver al menu', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Volver al menu' });
    expect(err).toBeNull();
    expect(result!.route).toBe('submenu');
    expect(result!.response_text).toContain('Menú Principal');
  });

  test('Configurar preferencias', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Configurar preferencias' });
    expect(err).toBeNull();
    expect(result!.menu_action).toBe('reminder_prefs');
  });

  test('Ver proximas', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Ver proximas' });
    expect(err).toBeNull();
    expect(result!.menu_action).toBe('upcoming_bookings');
  });
});

describe('Telegram Router — Fallback to AI Agent', () => {
  test('Free text goes to AI Agent', async () => {
    const [err, result] = await main({
      chat_id: '12345',
      text: 'Hola, necesito una cita para el lunes por la mañana',
    });
    expect(err).toBeNull();
    expect(result!.route).toBe('ai_agent');
    expect(result!.forward_to_ai).toBe(true);
    expect(result!.response_text).toBe('');
    expect(result!.callback_action).toBeNull();
    expect(result!.menu_action).toBeNull();
  });

  test('Question goes to AI Agent', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '¿Aceptan Isapre?' });
    expect(err).toBeNull();
    expect(result!.forward_to_ai).toBe(true);
  });

  test('Reschedule request goes to AI Agent', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Puedo cambiar mi cita del martes al jueves?' });
    expect(err).toBeNull();
    expect(result!.forward_to_ai).toBe(true);
  });

  test('Urgency goes to AI Agent', async () => {
    const [err, result] = await main({ chat_id: '12345', text: 'Tengo un dolor muy fuerte en el pecho' });
    expect(err).toBeNull();
    expect(result!.forward_to_ai).toBe(true);
  });
});

describe('Telegram Router — Priority order', () => {
  test('Callback data takes priority over text', async () => {
    const [err, result] = await main({
      chat_id: '12345',
      text: '/start',
      callback_data: 'cnf:booking-uuid',
    });
    expect(err).toBeNull();
    expect(result!.route).toBe('callback');
    expect(result!.callback_action).toBe('cnf');
  });

  test('Command takes priority over menu text', async () => {
    const [err, result] = await main({ chat_id: '12345', text: '/start' });
    expect(err).toBeNull();
    expect(result!.route).toBe('command');
    expect(result!.route).not.toBe('menu');
  });
});

describe('Telegram Router — Input validation', () => {
  test('Missing chat_id fails', async () => {
    const [err, result] = await main({ text: 'hello' });
    expect(err).not.toBeNull();
    expect(result).toBeNull();
  });

  test('Null text + null callback → AI Agent', async () => {
    const [err, result] = await main({ chat_id: '12345' });
    expect(err).toBeNull();
    expect(result!.forward_to_ai).toBe(true);
  });
});
