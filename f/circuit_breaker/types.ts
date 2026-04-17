import { z } from 'zod';

export type Result<T> = [Error | null, T | null];

export interface CircuitState {
    readonly service_id: string;
    readonly state: 'closed' | 'open' | 'half-open';
    readonly failure_count: number;
    readonly success_count: number;
    readonly failure_threshold: number;
    readonly success_threshold: number;
    readonly timeout_seconds: number;
    readonly opened_at: string | null;
    readonly half_open_at: string | null;
    readonly last_failure_at: string | null;
    readonly last_success_at: string | null;
    readonly last_error_message: string | null;
}

export interface CircuitBreakerRow {
    readonly service_id: string;
    readonly state: string;
    readonly failure_count: number;
    readonly success_count: number;
    readonly failure_threshold: number;
    readonly success_threshold: number;
    readonly timeout_seconds: number;
    readonly opened_at: string | null;
    readonly half_open_at: string | null;
    readonly last_failure_at: string | null;
    readonly last_success_at: string | null;
    readonly last_error_message: string | null;
}

export interface CircuitBreakerResult {
    readonly allowed?: boolean;
    readonly state?: string;
    readonly retry_after?: number;
    readonly message?: string;
    readonly failure_count?: number;
    readonly success_count?: number;
    readonly error_message?: string;
}

export const InputSchema = z.object({
      action: z.enum(['check', 'record_success', 'record_failure', 'reset', 'status']),
      service_id: z.string().min(1),
    });
