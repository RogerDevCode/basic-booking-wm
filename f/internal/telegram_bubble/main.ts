/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Telegram "bubble" — single entry/exit for testing full message flows
 * DB Tables Used  : None — pure flow simulation, no DB
 * Concurrency Risk: NO — single sequential execution
 * GCal Calls      : NO
 * Idempotency Key : NO
 * RLS Tenant ID   : NO
 * Zod Schemas     : YES — all inputs validated
 */

// ============================================================================
// TELEGRAM BUBBLE — Single entry/exit test harness
// ============================================================================
// Simulates the complete Telegram → Bot → Telegram pipeline.
// Input: { chat_id, text, callback_data }
// Output: { response_text, route, forward_to_ai, latency_ms }
//
// Usage (CLI):
//   npx tsx f/internal/telegram_bubble/main.ts "/start"
//   npx tsx f/internal/telegram_bubble/main.ts "1"
//   npx tsx f/internal/telegram_bubble/main.ts "cnf:abc-123"
//   npx tsx f/internal/telegram_bubble/main.ts --interactive
// ============================================================================

import { z } from 'zod';

type Result<T> = [Error | null, T | null];

interface BubbleOutput {
  readonly response_text: string;
  readonly route: string;
  readonly forward_to_ai: boolean;
  readonly latency_ms: number;
  readonly debug: {
    readonly trigger_chat_id: string;
    readonly trigger_text: string;
    readonly trigger_callback: string | null;
    readonly router_route: string;
    readonly router_menu_action: string | null;
    readonly router_callback_action: string | null;
  };
}

interface ConversationState {
  previous_intent: string | null;
  active_flow: string;
  flow_step: number;
  pending_data: Record<string, string>;
  last_user_utterance: string | null;
}

class TelegramBubble {
  private stateStore = new Map<string, ConversationState>();

  constructor(private chatId: string) {}

  async sendMessage(text: string | null, callbackData: string | null): Promise<Result<BubbleOutput>> {
    const startMs = Date.now();
    const username = 'TestUser';

    // Step 1: Webhook Trigger
    const [triggerErr, triggerData] = await this.runTrigger(text, callbackData, username);
    if (triggerErr !== null || triggerData === null) {
      return [triggerErr ?? new Error('trigger returned null'), null];
    }

    // Step 2: Router
    const [routerErr, routerData] = await this.runRouter(
      triggerData.chat_id,
      triggerData.text,
      triggerData.callback_data,
      triggerData.username,
    );
    if (routerErr !== null || routerData === null) {
      return [routerErr ?? new Error('router returned null'), null];
    }

    // Step 3: Deterministic response?
    if (!routerData.forward_to_ai && routerData.response_text.length > 0) {
      const latencyMs = Date.now() - startMs;
      return [null, {
        response_text: routerData.response_text,
        route: routerData.route,
        forward_to_ai: false,
        latency_ms: latencyMs,
        debug: {
          trigger_chat_id: triggerData.chat_id,
          trigger_text: triggerData.text,
          trigger_callback: triggerData.callback_data,
          router_route: routerData.route,
          router_menu_action: routerData.menu_action,
          router_callback_action: routerData.callback_action,
        },
      }];
    }

    // Step 4: AI Agent (free text)
    const [aiErr, aiData] = await this.runAI(triggerData.chat_id, triggerData.text);
    const latencyMs = Date.now() - startMs;

    if (aiErr !== null || aiData === null) {
      return [aiErr ?? new Error('AI Agent returned null'), null];
    }

    return [null, {
      response_text: aiData.ai_response,
      route: 'ai_agent',
      forward_to_ai: true,
      latency_ms: latencyMs,
      debug: {
        trigger_chat_id: triggerData.chat_id,
        trigger_text: triggerData.text,
        trigger_callback: triggerData.callback_data,
        router_route: routerData.route,
        router_menu_action: routerData.menu_action,
        router_callback_action: routerData.callback_action,
      },
    }];
  }

  private async runTrigger(
    text: string | null,
    callbackData: string | null,
    username: string,
  ): Promise<Result<{ chat_id: string; text: string; callback_data: string | null; username: string }>> {
    return [null, {
      chat_id: this.chatId,
      text: text ?? (callbackData ? '' : ''),
      callback_data: callbackData,
      username,
    }];
  }

  private async runRouter(
    chatId: string,
    text: string,
    callbackData: string | null,
    username: string,
  ): Promise<Result<{ route: string; forward_to_ai: boolean; response_text: string; menu_action: string | null; callback_action: string | null; callback_booking_id: string | null }>> {
    const { main: routerMain } = await import('../telegram_router/main');
    return await routerMain({ chat_id: chatId, text, callback_data: callbackData, username });
  }

  private async runAI(
    chatId: string,
    text: string,
  ): Promise<Result<{ intent: string; confidence: number; ai_response: string; entities: Record<string, unknown> }>> {
    const currentState = this.stateStore.get(chatId) ?? null;

    const { main: aiMain } = await import('../ai_agent/main');
    const result = await aiMain({
      chat_id: chatId,
      text,
      conversation_state: currentState ? {
        previous_intent: currentState.previous_intent,
        active_flow: currentState.active_flow,
        flow_step: currentState.flow_step,
        pending_data: currentState.pending_data,
        last_user_utterance: currentState.last_user_utterance,
      } : undefined,
    });

    // Update state store
    if (result.success && result.data !== null) {
      const prev = this.stateStore.get(chatId);
      this.stateStore.set(chatId, {
        previous_intent: result.data.intent,
        active_flow: this.determineFlow(result.data.intent),
        flow_step: (prev?.flow_step ?? 0) + 1,
        pending_data: this.extractPendingData(result.data.entities ?? {}),
        last_user_utterance: text,
      });
    }

    if (!result.success || result.data === null) {
      return [new Error(result.error_message ?? 'AI Agent failed'), null];
    }

    return [null, {
      intent: result.data.intent,
      confidence: result.data.confidence,
      ai_response: result.data.ai_response,
      entities: (result.data.entities as Record<string, unknown>) ?? {},
    }];
  }

  private determineFlow(intent: string): string {
    if (intent === 'crear_cita') return 'booking_wizard';
    if (intent === 'reagendar_cita') return 'reschedule_flow';
    if (intent === 'cancelar_cita') return 'cancellation_flow';
    return 'none';
  }

  private extractPendingData(entities: Record<string, unknown>): Record<string, string> {
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(entities)) {
      if (v !== null && v !== undefined) data[k] = String(v);
    }
    return data;
  }
}

// ============================================================================
// CLI
// ============================================================================

function printBanner() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         TELEGRAM BUBBLE — Test Harness                  ║');
  console.log('║  Single entry/exit for full pipeline simulation          ║');
  console.log('║  Type "quit" or "exit" to stop.                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
}

function formatResponse(output: BubbleOutput) {
  const box = '─'.repeat(56);
  console.log('');
  console.log(`  ${output.latency_ms}ms  |  Route: ${output.route}  |  AI: ${output.forward_to_ai ? 'YES' : 'NO'}`);
  console.log(`  ${box}`);
  console.log(`  Bot Response:`);
  console.log(`  ${output.response_text.replace(/\n/g, '\n  ')}`);
  console.log(`  ${box}`);
  if (output.debug.router_menu_action !== null) {
    console.log(`  Menu action: ${output.debug.router_menu_action}`);
  }
  if (output.debug.router_callback_action !== null) {
    console.log(`  Callback: ${output.debug.router_callback_action}`);
  }
  console.log('');
}

async function interactiveMode() {
  printBanner();
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const chatId = process.env['BUBBLE_CHAT_ID'] || '12345';
  const bubble = new TelegramBubble(chatId);

  console.log(`  Chat ID: ${chatId}`);
  console.log(`  Type a message or callback (e.g., "cnf:abc-123") and press Enter.\n`);

  const ask = () => {
    rl.question('You> ', async (input) => {
      const trimmed = input.trim();
      if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
        console.log('\nBye!');
        rl.close();
        process.exit(0);
        return;
      }
      if (trimmed === '') { ask(); return; }

      const callbackMatch = trimmed.match(/^(cnf|cxl|res|act|dea):(.*)$/i);
      const text = callbackMatch ? null : trimmed;
      const callbackData = callbackMatch ? trimmed.toLowerCase() : null;

      const [err, output] = await bubble.sendMessage(text, callbackData);
      if (err !== null || output === null) {
        console.log(`  Error: ${err?.message ?? 'null output'}`);
        ask();
        return;
      }
      formatResponse(output);
      ask();
    });
  };

  ask();
}

interface BubbleReport {
  readonly chat_id: string;
  readonly input_text: string | null;
  readonly input_callback: string | null;
  readonly output: BubbleOutput;
}

export async function main(rawInput: unknown): Promise<Result<BubbleReport>> {
  const parsed = z.object({
    chat_id: z.string().default('12345'),
    text: z.string().nullable().default(null),
    callback_data: z.string().nullable().default(null),
  }).safeParse(rawInput);

  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const { chat_id, text, callback_data } = parsed.data;
  const bubble = new TelegramBubble(chat_id);
  const [err, output] = await bubble.sendMessage(text, callback_data);
  if (err !== null || output === null) {
    return [err ?? new Error('null output'), null];
  }

  return [null, { chat_id, input_text: text, input_callback: callback_data, output }];
}

// CLI entry point
const isInteractive = process.argv.length <= 2 || process.argv.includes('--interactive') || process.argv.includes('-i');

if (isInteractive) {
  void interactiveMode();
} else {
  const args = process.argv.slice(2);
  const chatIdMatch = args.find(a => a.startsWith('--chat-id='));
  const chatId = chatIdMatch ? chatIdMatch.split('=')[1] : '12345';
  const message = args.filter(a => !a.startsWith('--')).join(' ');

  if (!message) {
    console.error('Usage: npx tsx f/internal/telegram_bubble/main.ts "your message"');
    console.error('       npx tsx f/internal/telegram_bubble/main.ts --interactive');
    process.exit(1);
  }

  const callbackMatch = message.match(/^(cnf|cxl|res|act|dea):(.*)$/i);
  const text = callbackMatch ? null : message;
  const callbackData = callbackMatch ? message.toLowerCase() : null;

  void main({ chat_id: chatId, text, callback_data: callbackData }).then(([err, report]) => {
    if (err !== null) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    if (report !== null) {
      formatResponse(report.output);
    }
    process.exit(0);
  });
}
