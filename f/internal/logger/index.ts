// ============================================================================
// LOGGER — Structured logging with fail-fast on configuration errors
// ============================================================================
// All logging MUST use this module. No console.log/console.error in production.
// Uses wmill.log when available, falls back to structured JSON on stderr.
// ============================================================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown> | undefined;
}

function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  });
}

function log(level: LogLevel, module: string, message: string, metadata?: Record<string, unknown>): void {
  const entry: LogEntry = { level, module, message, timestamp: new Date().toISOString(), metadata: metadata ?? undefined };

  // Check for Windmill runtime (wmill global variable)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (typeof g.wmill !== 'undefined' && typeof g.wmill.log === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    g.wmill.log(formatLogEntry(entry));
    return;
  }

  // Fallback: structured JSON to stderr (never stdout for production)
  process.stderr.write(formatLogEntry(entry) + '\n');
}

export const logger = {
  info(module: string, message: string, metadata?: Record<string, unknown>): void {
    log('info', module, message, metadata);
  },

  warn(module: string, message: string, metadata?: Record<string, unknown>): void {
    log('warn', module, message, metadata);
  },

  error(module: string, message: string, error?: unknown, metadata?: Record<string, unknown>): void {
    const errMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    log('error', module, message, { ...metadata, error: errMessage, stack });
  },

  debug(module: string, message: string, metadata?: Record<string, unknown>): void {
    log('debug', module, message, metadata);
  },
};

export function failFast(module: string, message: string, error?: unknown): never {
  logger.error(module, `FATAL: ${message}`, error);
  const errorMsg = error instanceof Error ? error.message : typeof error === 'object' && error != null ? JSON.stringify(error) : String(error);
  throw new Error(`[${module}] FATAL: ${message}${error != null ? ` -- ${errorMsg}` : ''}`);
}
