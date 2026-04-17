/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Telegram bubble — conversational test harness using real Redis + FSM
 * DB Tables Used  : None — mock data for specialties/doctors/slots
 * Concurrency Risk: NO — single sequential execution
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES
 */

// ============================================================================
// TELEGRAM BUBBLE v3 — Real Redis + Mock Data + FSM
// ============================================================================
// Uses REAL Redis for state persistence (like production).
// Uses MOCK data for DB queries (specialties, doctors, slots).
// Uses ACTUAL FSM from booking_fsm for transitions.
// ============================================================================

import { z } from 'zod';
import type { Result } from '../result';
import type { BubbleReport, BubbleOutput } from './types';
import { TelegramBubble } from './services';

// ============================================================================
// CLI
// ============================================================================

const stepIcons: Record<string, string> = {
  idle: '📱', selecting_specialty: '📅', selecting_doctor: '👨‍⚕️',
  selecting_time: '🕐', confirming: '📋', completed: '✅',
};

function formatResponse(output: BubbleOutput) {
  const icon = stepIcons[output.step_name] ?? '💬';
  const keyboard = output.inline_keyboard.length > 0
    ? `\n  [${output.inline_keyboard.map(row => row.map(btn => `"${btn.text}"`).join(' | ')).join('] [')}]`
    : '';
  const edit = output.should_edit ? ' ✏️ (edit)' : ' 📤 (new)';

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${icon} Paso ${String(output.step_num)}: ${output.step_name} | ${String(output.latency_ms)}ms${edit}`);
  if (output.draft_summary) console.log(`  📝 ${output.draft_summary}`);
  console.log('─'.repeat(64));
  console.log(`  ${output.text.replace(/\n/g, '\n  ')}`);
  if (keyboard) console.log(`  Teclado:${keyboard}`);
  console.log(`${'─'.repeat(64)}\n`);
}

export async function main(rawInput: unknown): Promise<Result<BubbleReport>> {
  const parsed = z.object({
    chat_id: z.string().default('bubble-test'),
    text: z.string().nullable().default(null),
    callback_data: z.string().nullable().default(null),
  }).safeParse(rawInput);

  if (!parsed.success) return [new Error(`Invalid input: ${parsed.error.message}`), null];

  const { chat_id, text, callback_data } = parsed.data;
  const bubble = new TelegramBubble(chat_id);
  const [err, output] = await bubble.send(text, callback_data);
  await bubble.close();

  if (err !== null || output === null) return [err ?? new Error('null output'), null];
  return [null, { chat_id, input_text: text, input_callback: callback_data, output }];
}

// CLI entry point
if (process.argv[1]?.endsWith('telegram_bubble/main.ts')) {
  const isInteractive = process.argv.includes('--interactive') || process.argv.includes('-i');

  if (isInteractive) {
    // Interactive mode would go here
    console.log('Interactive mode — use npx tsx with script instead');
    process.exit(0);
  }

  const args = process.argv.slice(2);
  const chatIdMatch = args.find(a => a.startsWith('--chat-id='));
  const chatId = chatIdMatch ? chatIdMatch.split('=')[1] : 'bubble-test';
  const message = args.filter(a => !a.startsWith('--')).join(' ');

  if (!message) {
    console.error('Usage: npx tsx f/internal/telegram_bubble/main.ts "your message"');
    process.exit(1);
  }

  const cbMatch = /^(spec|doc|time|cfm|menu|back|cancel)(:.*)?$/.exec(message);
  const text = cbMatch ? null : message;
  const callback = cbMatch ? message : null;

  void main({ chat_id: chatId, text, callback_data: callback }).then(([err, report]) => {
    if (err !== null) { console.error(`Error: ${err.message}`); process.exit(1); }
    if (report !== null) formatResponse(report.output);
    process.exit(0);
  });
}
