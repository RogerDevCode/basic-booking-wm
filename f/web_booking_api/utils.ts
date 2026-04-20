import { createHash } from 'node:crypto';
import type { Result } from '../internal/result/index';

export function deriveIdempotencyKey(prefix: string, parts: readonly string[]): string {
  return createHash('sha256')
    .update(`${prefix}:${parts.join(':')}`)
    .digest('hex')
    .slice(0, 32);
}

export function calculateEndTime(startTimeStr: string, durationMinutes: number): Result<string> {
  const start = new Date(startTimeStr);
  if (Number.isNaN(start.getTime())) {
    return [new Error('formato_fecha_invalido'), null];
  }
  return [null, new Date(start.getTime() + durationMinutes * 60000).toISOString()];
}
