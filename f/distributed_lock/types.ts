import { z } from 'zod';

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface LockInfo {
    readonly lock_id: string;
    readonly lock_key: string;
    readonly owner_token: string;
    readonly provider_id: string;
    readonly start_time: string;
    readonly acquired_at: string;
    readonly expires_at: string;
}

export interface LockResult {
    readonly acquired?: boolean;
    readonly released?: boolean;
    readonly locked?: boolean;
    readonly cleaned?: number;
    readonly lock?: LockInfo;
    readonly reason?: string;
    readonly owner?: string;
    readonly expires_at?: string;
}

/**
 * DB Row structure for booking_locks table
 */
export interface LockRow {
    readonly lock_id: string;
    readonly lock_key: string;
    readonly owner_token: string;
    readonly provider_id: string;
    readonly start_time: Date;
    readonly acquired_at: Date;
    readonly expires_at: Date;
}

export const InputSchema = z.object({
      action: z.enum(['acquire', 'release', 'check', 'cleanup']),
      lock_key: z.string().min(1),
      owner_token: z.string().min(1).optional(),
      provider_id: z.uuid(), // provider_id is mandatory for RLS context
      start_time: z.iso.datetime().optional(),
      ttl_seconds: z.number().int().min(1).max(3600).default(30),
    });
