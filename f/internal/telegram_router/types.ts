import { z } from 'zod';
import type { BookingState, DraftBooking } from '../booking_fsm';

export type RouteType = 'callback' | 'command' | 'menu' | 'submenu' | 'wizard' | 'ai_agent';

export interface InlineButton {
  readonly text: string;
  readonly callback_data: string;
}

export interface RouteResult {
  readonly route: RouteType;
  readonly forward_to_ai: boolean;
  readonly response_text: string;
  readonly inline_keyboard: InlineButton[][];
  readonly callback_action: string | null;
  readonly callback_booking_id: string | null;
  readonly menu_action: string | null;
  readonly nextState: BookingState | null;
  readonly nextDraft: DraftBooking | null;
  readonly nextFlowStep: number;
  readonly should_edit: boolean;
  readonly message_id: number | null;
}

export const InputSchema = z.object({
  text: z.string().nullable().default(null),
  chat_id: z.string().min(1),
  callback_data: z.string().nullable().default(null),
  callback_query_id: z.string().nullable().default(null),
  username: z.string().nullable().default(null),
  booking_state: z.unknown().nullable().default(null),
  booking_draft: z.unknown().nullable().default(null),
  message_id: z.number().int().nullable().default(null),
});

export type RouterInput = z.infer<typeof InputSchema>;

export interface RouterOutput {
  readonly data: RouteResult | null;
  readonly error: string | null;
}
