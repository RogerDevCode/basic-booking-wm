
export async function answerCallbackQuery(botToken: string, callbackQueryId: string, text: string, showAlert = false): Promise<boolean> {
    try {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
    } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    process.stderr.write(JSON.stringify({ level: 'error', module: 'telegram_callback', message: 'answerCallbackQuery failed', error: err.message }) + '\n');
    return false;
    }
}
