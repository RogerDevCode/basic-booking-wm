import type { BubbleOutput } from './types';

const stepIcons: Record<string, string> = {
  idle: '📱', selecting_specialty: '📅', selecting_doctor: '👨‍⚕️',
  selecting_time: '🕐', confirming: '📋', completed: '✅',
};

export function formatResponse(output: BubbleOutput): void {
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
