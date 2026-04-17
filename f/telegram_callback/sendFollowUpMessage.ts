
export async function sendFollowUpMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
    try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'MarkdownV2',
      }),
      signal: AbortSignal.timeout(10000),
    });

    return response.ok;
    } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    process.stderr.write(JSON.stringify({ level: 'error', module: 'telegram_callback', message: 'sendFollowUpMessage failed', error: err.message }) + '\n');
    return false;
    }
}
