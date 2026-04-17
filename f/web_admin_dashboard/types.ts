import { z } from 'zod';

export const InputSchema = z.object({
  admin_user_id: z.uuid(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface AdminDashboardResult {
  readonly total_users: number;
  readonly total_bookings: number;
  readonly total_revenue_cents: number;
  readonly no_show_rate: string;
  readonly active_providers: number;
  readonly pending_bookings: number;
}