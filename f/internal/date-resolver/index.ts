/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Canonical relative date resolver — NL input → YYYY-MM-DD
 * DB Tables Used  : NONE — pure deterministic function
 * Concurrency Risk: NO — stateless, no I/O
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : NO — all inputs are plain strings; validation is internal
 */

// ============================================================================
// DATE RESOLVER — Canonical Spanish NL date → YYYY-MM-DD
// ============================================================================
// Single Source of Truth for all date resolution across the booking system.
// All entry paths that accept user-supplied dates MUST route through here.
//
// Supported input patterns (case-insensitive, accent-tolerant):
//   Relative : hoy, mañana, pasado mañana
//   Weekdays : lunes, martes, miércoles, jueves, viernes, sábado, domingo
//              (always resolves to the NEXT occurrence, inclusive of today)
//   Explicit : DD/MM, DD/MM/YYYY, YYYY-MM-DD
//   ISO dt   : any string starting with YYYY-MM-DD (datetime prefix ignored)
//
// Returns : YYYY-MM-DD string | null (unrecognized input returns null, not error)
//
// Timezone strategy:
//   Dates are resolved in the given IANA timezone so that "mañana" means
//   tomorrow in the user's local wall-clock time, not UTC.
//   We use Intl.DateTimeFormat to extract local date parts safely without
//   depending on any external library.
// ============================================================================

/** Options for resolveDate */
export interface ResolveDateOpts {
  /**
   * Reference date in YYYY-MM-DD format (local, in opts.timezone).
   * Defaults to today in opts.timezone.
   * Inject a fixed value in tests for deterministic results.
   */
  readonly referenceDate?: string;
  /**
   * IANA timezone identifier.
   * Defaults to 'America/Mexico_City'.
   */
  readonly timezone?: string;
}

const DEFAULT_TIMEZONE = 'America/Mexico_City';

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Returns current local date as YYYY-MM-DD in the given timezone. */
function todayInTimezone(tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA locale produces YYYY-MM-DD format natively
  return fmt.format(new Date());
}

/** Adds `days` to a YYYY-MM-DD date string. Returns YYYY-MM-DD. */
function addDays(ymd: string, days: number): string {
  // Parse as UTC midnight to avoid DST shifts; add days as ms offset.
  const [yyyy, mm, dd] = ymd.split('-').map(Number) as [number, number, number];
  const base = Date.UTC(yyyy, mm - 1, dd);
  const result = new Date(base + days * 86_400_000);
  return result.toISOString().slice(0, 10);
}

/** Returns the day-of-week index (0=Sunday … 6=Saturday) for a YYYY-MM-DD. */
function dayOfWeek(ymd: string): number {
  const [yyyy, mm, dd] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(yyyy, mm - 1, dd)).getUTCDay();
}

/** Resolves next occurrence of target weekday (0=Sun…6=Sat) from a reference. */
function nextWeekday(ref: string, target: number): string {
  const current = dayOfWeek(ref);
  const diff = (target - current + 7) % 7;
  // diff === 0 means today IS that weekday → resolve to today (same day)
  return addDays(ref, diff);
}

/** Normalises common Spanish accented chars for case-insensitive matching. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Weekday name → 0-based Sunday index (matches Date.getUTCDay())
const WEEKDAY_MAP: Readonly<Record<string, number>> = {
  domingo:   0,
  lunes:     1,
  martes:    2,
  miercoles: 3, // normalised — accent removed
  jueves:    4,
  viernes:   5,
  sabado:    6, // normalised — accent removed
};

// ─── Validation helpers ──────────────────────────────────────────────────────

/**
 * Returns true if y/m/d form a valid calendar date.
 * Month is 1-based. Day is 1-based.
 */
function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() + 1 === m &&
    probe.getUTCDate() === d
  );
}

/** Pads a number to the given width with leading zeros. */
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Formats y/m/d as YYYY-MM-DD. Assumes inputs are valid. */
function toYMD(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolves a user-supplied date string to an absolute YYYY-MM-DD date.
 *
 * Returns `null` when the input is not a recognised date expression.
 * This is NOT an error — callers should treat `null` as "date not yet provided"
 * and ask the user for clarification.
 *
 * @param input    Raw user text or entity value (e.g. "mañana", "15/04", "2026-04-20")
 * @param opts     Optional reference date and timezone
 * @returns        YYYY-MM-DD string, or null if unrecognised
 */
export function resolveDate(
  input: string,
  opts: ResolveDateOpts = {},
): string | null {
  const tz = opts.timezone ?? DEFAULT_TIMEZONE;
  const ref = opts.referenceDate ?? todayInTimezone(tz);
  const src = normalise(input.trim());

  // ── 1. Relative keywords ──────────────────────────────────────────────────

  if (src === 'hoy') return ref;
  if (src === 'manana' || src === 'mañana') return addDays(ref, 1);
  if (src === 'pasado manana' || src === 'pasado mañana') return addDays(ref, 2);

  // ── 2. Weekday names ──────────────────────────────────────────────────────

  const weekdayIndex = WEEKDAY_MAP[src];
  if (weekdayIndex !== undefined) {
    return nextWeekday(ref, weekdayIndex);
  }

  // ── 3. ISO date (YYYY-MM-DD) or ISO datetime prefix ───────────────────────

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (isoMatch !== null) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (isValidCalendarDate(y, m, d)) return toYMD(y, m, d);
    return null;
  }

  // ── 4. DD/MM/YYYY ─────────────────────────────────────────────────────────

  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (dmyMatch !== null) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (isValidCalendarDate(y, m, d)) return toYMD(y, m, d);
    return null;
  }

  // ── 5. DD/MM (year inferred) ─────────────────────────────────────────────

  const dmMatch = /^(\d{1,2})\/(\d{1,2})$/.exec(input.trim());
  if (dmMatch !== null) {
    const d = Number(dmMatch[1]);
    const m = Number(dmMatch[2]);
    const [refY] = ref.split('-').map(Number) as [number, number, number];

    // Try current year first; if the result is in the past, try next year.
    if (isValidCalendarDate(refY, m, d)) {
      const candidate = toYMD(refY, m, d);
      if (candidate >= ref) return candidate;
      if (isValidCalendarDate(refY + 1, m, d)) return toYMD(refY + 1, m, d);
    }
    return null;
  }

  // ── 6. Unrecognised ──────────────────────────────────────────────────────
return null;
}

/**
* Resolves a user-supplied time string to a 24h format HH:MM.
*
* Supported patterns:
*   "10:00", "10", "10am", "10:30 pm", "las 10", "14:00 hrs"
*
* Returns HH:MM string | null.
*/
export function resolveTime(input: string): string | null {
const src = input.toLowerCase().trim();

// Extract numbers and meridiem
const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs|horas)?/i.exec(src.replace(/^las\s+/i, ''));
if (match === null) return null;

let h = Number(match[1]);
const m = match[2] ? Number(match[2]) : 0;
const meridiem = match[3];

if (meridiem === 'pm' && h < 12) h += 12;
if (meridiem === 'am' && h === 12) h = 0;

if (h < 0 || h > 23 || m < 0 || m > 59) return null;

return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
* Convenience: returns today's date in YYYY-MM-DD format.
...
 * Accepts an optional timezone override.
 * Wraps resolveDate('hoy') for callers that only need the current date.
 */
export function todayYMD(opts: Pick<ResolveDateOpts, 'timezone' | 'referenceDate'> = {}): string {
  return resolveDate('hoy', opts) ?? ''; // 'hoy' always resolves in practice
}
