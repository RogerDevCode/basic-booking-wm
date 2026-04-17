import { z } from 'zod';

export const InputSchema = z.object({
  provider_user_id: z.uuid(),
  date: z.string().optional(),
});

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface AgendaItem {
  booking_id: string;
  client_name: string;
  client_email: string | null;
  service_name: string;
  start_time: string;
  end_time: string;
  status: string;
}

export interface ProviderStats {
  today_total: number;
  month_total: number;
  month_completed: number;
  month_no_show: number;
  attendance_rate: string;
}

export interface DashboardResult {
  provider_id: string;
  provider_name: string;
  specialty: string;
  agenda: AgendaItem[];
  stats: ProviderStats;
}