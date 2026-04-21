import { type BookingState, type DraftBooking } from '../booking_fsm';

export interface InlineButton {
  readonly text: string;
  readonly callback_data: string;
}

export interface BubbleOutput {
  readonly text: string;
  readonly inline_keyboard: InlineButton[][];
  readonly route: string;
  readonly latency_ms: number;
  readonly step_name: string;
  readonly step_num: number;
  readonly should_edit: boolean;
  readonly draft_summary: string;
}

export interface ConvState {
  readonly bookingState: BookingState | null;
  readonly draft: DraftBooking;
  readonly messageId: number | null;
}

export interface BubbleReport {
  readonly chat_id: string;
  readonly input_text: string | null;
  readonly input_callback: string | null;
  readonly output: BubbleOutput;
}
