import { describe, test, expect, vi, beforeEach } from 'vitest';
import { handleBookingWizard } from '../f/internal/telegram_router/booking-wizard';
import { emptyDraft } from '../f/internal/booking_fsm';

// We mock the database and individual data fetchers to keep the test deterministic
// and avoid needing a live postgres container for this specific flow logic test.
vi.mock('../f/internal/db/client', () => {
  const makeQueryFn = () => {
    const fn = vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => {
      const query = Array.from(strings).join(' ');
      if (query.includes('FROM providers')) {
        return Promise.resolve([{ provider_id: '00000000-0000-0000-0000-000000000123' }]);
      }
      if (query.includes('FROM clients') || query.includes('INSERT INTO clients')) {
        return Promise.resolve([{ client_id: 'client-123' }]);
      }
      return Promise.resolve([]);
    });
    (fn as any).unsafe = vi.fn().mockResolvedValue([]);
    (fn as any).release = vi.fn();
    return fn;
  };

  const reservedMock = makeQueryFn();
  const sqlMock = makeQueryFn();
  (sqlMock as any).values = vi.fn().mockResolvedValue([]);
  (sqlMock as any).end = vi.fn().mockResolvedValue(undefined);
  (sqlMock as any).begin = vi.fn((op: (tx: unknown) => unknown) => op(sqlMock));
  (sqlMock as any).reserve = vi.fn().mockResolvedValue(reservedMock);

  return {
    createDbClient: vi.fn(() => sqlMock),
  };
});

// Mock the data fetchers used by the wizard
vi.mock('../f/internal/booking_fsm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../f/internal/booking_fsm')>();
  return {
    ...actual,
    fetchSpecialties: vi.fn().mockResolvedValue([null, { specialties: [{ id: 'spec-1', name: 'General' }] }]),
    fetchDoctors: vi.fn().mockResolvedValue([null, { doctors: [{ id: 'doc-1', name: 'Dr. Smith' }] }]),
    fetchSlots: vi.fn().mockResolvedValue([null, { 
      slots: [{ id: 'slot-1', label: '10:00', start_time: '2026-04-15T10:00:00Z' }],
      total_available: 1,
      total_booked: 0
    }]),
  };
});

// Mock the booking_create module (needs to be relative to the caller in booking-wizard.ts)
vi.mock('../f/booking_create/main', () => ({
  main: vi.fn().mockResolvedValue([null, {
    booking_id: 'booking-123',
    status: 'confirmed',
    start_time: '2026-04-15T10:00:00Z',
    end_time: '2026-04-15T10:30:00Z',
    provider_name: 'Dr. Smith',
    service_name: 'General',
    client_name: 'TestUser',
  }]),
}));

// Also mock with the path used by the dynamic import in booking-wizard.ts
vi.mock('../../booking_create/main', () => ({
  main: vi.fn().mockResolvedValue([null, {
    booking_id: 'booking-123',
    status: 'confirmed',
    start_time: '2026-04-15T10:00:00Z',
    end_time: '2026-04-15T10:30:00Z',
    provider_name: 'Dr. Smith',
    service_name: 'General',
    client_name: 'TestUser',
  }]),
}));

describe('E2E Telegram Booking Flow Simulation', () => {
  const chatId = '123456789';
  const userName = 'TestUser';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should complete a full booking flow from menu selection to confirmation', async () => {
    // 1. User sends "1" or "agendar cita" while idle
    const [err1, res1] = await handleBookingWizard({
      text: '1',
      callbackData: null,
      currentState: null,
      draft: emptyDraft(),
      chatId,
      userName
    });

    expect(err1).toBeNull();
    expect(res1?.nextState.name).toBe('selecting_specialty');
    expect(res1?.inline_keyboard.length).toBeGreaterThan(0);

    // 2. User selects specialty
    const [err2, res2] = await handleBookingWizard({
      text: '',
      callbackData: 'spec:spec-1',
      currentState: res1!.nextState,
      draft: res1!.nextDraft,
      chatId,
      userName
    });

    expect(err2).toBeNull();
    expect(res2?.nextState.name).toBe('selecting_doctor');
    expect(res2?.nextDraft.specialty_id).toBe('spec-1');

    // 3. User selects doctor
    const [err3, res3] = await handleBookingWizard({
      text: '',
      callbackData: 'doc:doc-1',
      currentState: res2!.nextState,
      draft: res2!.nextDraft,
      chatId,
      userName
    });

    expect(err3).toBeNull();
    expect(res3?.nextState.name).toBe('selecting_time');
    expect(res3?.nextDraft.doctor_id).toBe('doc-1');

    // 4. User selects "mañana" (Relative date resolution)
    const [err4, res4] = await handleBookingWizard({
      text: 'mañana',
      callbackData: null,
      currentState: res3!.nextState,
      draft: res3!.nextDraft,
      chatId,
      userName
    });

    expect(err4).toBeNull();
    expect(res4?.nextState.name).toBe('selecting_time');
    expect(res4?.nextDraft.target_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 5. User selects a time slot
    const [err5, res5] = await handleBookingWizard({
      text: '',
      callbackData: 'slot:2026-04-15T10:00:00Z',
      currentState: res4!.nextState,
      draft: res4!.nextDraft,
      chatId,
      userName
    });

    expect(err5).toBeNull();
    expect(res5?.nextState.name).toBe('confirming');
    expect(res5?.nextDraft.start_time).toBe('2026-04-15T10:00:00Z');

    // 6. User confirms booking
    const [err6, res6] = await handleBookingWizard({
      text: '',
      callbackData: 'cfm:yes',
      currentState: res5!.nextState,
      draft: res5!.nextDraft,
      chatId,
      userName
    });

    expect(err6).toBeNull();
    expect(res6?.nextState.name).toBe('completed');
    expect(res6?.response_text).toContain('✅');
  });
});
