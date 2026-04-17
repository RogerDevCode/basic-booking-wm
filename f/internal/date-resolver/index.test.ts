/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Unit tests for the canonical date resolver
 * DB Tables Used  : NONE — pure unit test
 * Concurrency Risk: NO
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : NO
 */

// ============================================================================
// DATE RESOLVER — Unit tests with fixed reference date 2026-04-14 (Tuesday)
// ============================================================================
// Reference: Tuesday 2026-04-14 (America/Mexico_City)
// Weekday mapping for reference:
//   0=Sun  1=Mon  2=Tue(ref)  3=Wed  4=Thu  5=Fri  6=Sat
// ============================================================================

import { describe, test, expect } from 'vitest';
import { resolveDate, todayYMD } from './index';

const REF = '2026-04-14'; // Tuesday
const OPTS = { referenceDate: REF, timezone: 'America/Mexico_City' };

// ─── Relative keywords ────────────────────────────────────────────────────────

describe('resolveDate — relative keywords', () => {
  test('hoy → reference date', () => {
    expect(resolveDate('hoy', OPTS)).toBe('2026-04-14');
  });

  test('Hoy (case-insensitive) → reference date', () => {
    expect(resolveDate('Hoy', OPTS)).toBe('2026-04-14');
  });

  test('mañana → reference + 1', () => {
    expect(resolveDate('mañana', OPTS)).toBe('2026-04-15');
  });

  test('manana (no accent) → reference + 1', () => {
    expect(resolveDate('manana', OPTS)).toBe('2026-04-15');
  });

  test('MAÑANA (uppercase) → reference + 1', () => {
    expect(resolveDate('MAÑANA', OPTS)).toBe('2026-04-15');
  });

  test('pasado mañana → reference + 2', () => {
    expect(resolveDate('pasado mañana', OPTS)).toBe('2026-04-16');
  });

  test('pasado manana (no accent) → reference + 2', () => {
    expect(resolveDate('pasado manana', OPTS)).toBe('2026-04-16');
  });
});

// ─── Weekday names ────────────────────────────────────────────────────────────

describe('resolveDate — weekday names (ref = Tuesday 2026-04-14)', () => {
  test('martes (today = Tuesday) → same day 2026-04-14', () => {
    // diff = (2 - 2 + 7) % 7 = 0 → today
    expect(resolveDate('martes', OPTS)).toBe('2026-04-14');
  });

  test('miércoles → 2026-04-15 (next day)', () => {
    expect(resolveDate('miércoles', OPTS)).toBe('2026-04-15');
  });

  test('miercoles (no accent) → 2026-04-15', () => {
    expect(resolveDate('miercoles', OPTS)).toBe('2026-04-15');
  });

  test('jueves → 2026-04-16', () => {
    expect(resolveDate('jueves', OPTS)).toBe('2026-04-16');
  });

  test('viernes → 2026-04-17 (this Friday)', () => {
    expect(resolveDate('viernes', OPTS)).toBe('2026-04-17');
  });

  test('sábado → 2026-04-18', () => {
    expect(resolveDate('sábado', OPTS)).toBe('2026-04-18');
  });

  test('sabado (no accent) → 2026-04-18', () => {
    expect(resolveDate('sabado', OPTS)).toBe('2026-04-18');
  });

  test('domingo → 2026-04-19', () => {
    expect(resolveDate('domingo', OPTS)).toBe('2026-04-19');
  });

  test('lunes → 2026-04-20 (next Monday, not yesterday)', () => {
    // ref is Tuesday; next Monday is 6 days ahead
    expect(resolveDate('lunes', OPTS)).toBe('2026-04-20');
  });

  test('weekday names are case-insensitive', () => {
    expect(resolveDate('LUNES', OPTS)).toBe('2026-04-20');
    expect(resolveDate('Jueves', OPTS)).toBe('2026-04-16');
  });
});

// ─── ISO dates ────────────────────────────────────────────────────────────────

describe('resolveDate — ISO YYYY-MM-DD', () => {
  test('exact ISO date passes through', () => {
    expect(resolveDate('2026-04-20', OPTS)).toBe('2026-04-20');
  });

  test('ISO date in the past passes through (no future-forcing)', () => {
    expect(resolveDate('2025-12-01', OPTS)).toBe('2025-12-01');
  });

  test('ISO datetime prefix — only date part extracted', () => {
    expect(resolveDate('2026-05-10T10:30:00', OPTS)).toBe('2026-05-10');
  });

  test('ISO datetime with offset — only date part extracted', () => {
    expect(resolveDate('2026-05-10T10:30:00-05:00', OPTS)).toBe('2026-05-10');
  });

  test('invalid ISO date 2026-02-30 → null', () => {
    expect(resolveDate('2026-02-30', OPTS)).toBeNull();
  });

  test('invalid ISO date 2026-13-01 → null', () => {
    expect(resolveDate('2026-13-01', OPTS)).toBeNull();
  });
});

// ─── DD/MM/YYYY ───────────────────────────────────────────────────────────────

describe('resolveDate — DD/MM/YYYY', () => {
  test('20/04/2026 → 2026-04-20', () => {
    expect(resolveDate('20/04/2026', OPTS)).toBe('2026-04-20');
  });

  test('1/5/2026 (single-digit day/month) → 2026-05-01', () => {
    expect(resolveDate('1/5/2026', OPTS)).toBe('2026-05-01');
  });

  test('31/04/2026 (April has 30 days) → null', () => {
    expect(resolveDate('31/04/2026', OPTS)).toBeNull();
  });

  test('29/02/2026 (2026 not a leap year) → null', () => {
    expect(resolveDate('29/02/2026', OPTS)).toBeNull();
  });

  test('29/02/2028 (2028 IS a leap year) → 2028-02-29', () => {
    expect(resolveDate('29/02/2028', OPTS)).toBe('2028-02-29');
  });
});

// ─── DD/MM (year inferred) ────────────────────────────────────────────────────

describe('resolveDate — DD/MM (year inferred)', () => {
  test('15/04 (future in 2026) → 2026-04-15', () => {
    expect(resolveDate('15/04', OPTS)).toBe('2026-04-15');
  });

  test('14/04 (same as ref day) → 2026-04-14', () => {
    // same day = not in the past, should return current year
    expect(resolveDate('14/04', OPTS)).toBe('2026-04-14');
  });

  test('01/01 (past in 2026, Jan 1) → wraps to 2027-01-01', () => {
    expect(resolveDate('01/01', OPTS)).toBe('2027-01-01');
  });

  test('31/12 (past in 2026 if ref is April) → wraps to 2026-12-31', () => {
    // Dec 31 2026 is still in the future relative to Apr 14
    expect(resolveDate('31/12', OPTS)).toBe('2026-12-31');
  });

  test('13/04 (yesterday) → wraps to 2027-04-13', () => {
    expect(resolveDate('13/04', OPTS)).toBe('2027-04-13');
  });

  test('31/02 (invalid day) → null', () => {
    expect(resolveDate('31/02', OPTS)).toBeNull();
  });
});

// ─── Unrecognised input ───────────────────────────────────────────────────────

describe('resolveDate — unrecognised input', () => {
  test('empty string → null', () => {
    expect(resolveDate('', OPTS)).toBeNull();
  });

  test('random text → null', () => {
    expect(resolveDate('no sé cuándo', OPTS)).toBeNull();
  });

  test('just a number → null', () => {
    expect(resolveDate('15', OPTS)).toBeNull();
  });

  test('partial ISO with no day → null', () => {
    expect(resolveDate('2026-04', OPTS)).toBeNull();
  });

  test('whitespace-only string → null', () => {
    expect(resolveDate('   ', OPTS)).toBeNull();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('resolveDate — edge cases', () => {
  test('addDays crosses month boundary', () => {
    // ref is April 30 → mañana is May 1
    expect(resolveDate('mañana', { referenceDate: '2026-04-30', timezone: 'America/Mexico_City' }))
      .toBe('2026-05-01');
  });

  test('addDays crosses year boundary', () => {
    expect(resolveDate('mañana', { referenceDate: '2026-12-31', timezone: 'America/Mexico_City' }))
      .toBe('2027-01-01');
  });

  test('weekday resolution on Sunday reference', () => {
    // ref = 2026-04-19 (Sunday = 0)
    // domingo → diff = (0 - 0 + 7) % 7 = 0 → same day
    expect(resolveDate('domingo', { referenceDate: '2026-04-19', timezone: 'America/Mexico_City' }))
      .toBe('2026-04-19');
    // lunes → diff = (1 - 0 + 7) % 7 = 1 → next day
    expect(resolveDate('lunes', { referenceDate: '2026-04-19', timezone: 'America/Mexico_City' }))
      .toBe('2026-04-20');
  });
});

// ─── todayYMD convenience ─────────────────────────────────────────────────────

describe('todayYMD', () => {
  test('with injected referenceDate returns that date', () => {
    expect(todayYMD({ referenceDate: '2026-04-14' })).toBe('2026-04-14');
  });

  test('without referenceDate returns a YYYY-MM-DD string', () => {
    const result = todayYMD();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
