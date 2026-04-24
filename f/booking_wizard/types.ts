import { z } from 'zod';
import { DEFAULT_TIMEZONE } from '../internal/config/index.ts';

export const WizardStateSchema = z.object({
  step: z.coerce.number().int().min(0),
  client_id: z.string().min(1),
  chat_id: z.string().min(1),
  selected_date: z.string().nullable(),
  selected_time: z.string().nullable(),
}).readonly();

export type WizardState = Readonly<z.infer<typeof WizardStateSchema>>;

export const InputSchema = z.object({
  action: z.enum(['start', 'select_date', 'select_time', 'confirm', 'cancel', 'back']),
  wizard_state: z.record(z.string(), z.unknown()).optional(),
  user_input: z.string().optional(),
  provider_id: z.string().optional(),
  service_id: z.string().optional(),
  timezone: z.string().optional().default(DEFAULT_TIMEZONE),
}).readonly();

export type Input = Readonly<z.infer<typeof InputSchema>>;

export interface StepView {
  readonly message: string;
  readonly reply_keyboard: readonly (readonly string[])[];
  readonly new_state: WizardState;
  readonly force_reply?: boolean;
  readonly reply_placeholder?: string;
}

import type { WizardRepository } from './WizardRepository.ts';

export interface ActionContext {
  readonly input: Input;
  readonly state: WizardState;
  readonly repo: WizardRepository;
  readonly serviceDurationMin: number;
}

export interface ActionHandler {
  handle(context: ActionContext): Promise<[Error | null, StepView | null]>;
}