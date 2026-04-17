import postgres from 'postgres';

export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text: string,
  showAlert = false
): Promise<boolean> {
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

export async function sendFollowUpMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
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

export async function updateBookingStatus(
  tx: postgres.Sql,
  bookingId: string,
  newStatus: string,
  clientId: string | undefined,
  actor: string
): Promise<[Error | null, boolean]> {
  const bookings = await tx.values<[string, string, string, string, string]>`
    SELECT booking_id, status, client_id, start_time, end_time
    FROM bookings
    WHERE booking_id = ${bookingId}::uuid
      AND status NOT IN ('cancelled', 'completed', 'no_show', 'rescheduled')
    LIMIT 1
  `;

  const booking = bookings[0];
  if (booking === undefined) {
    return [new Error('Booking not found or already terminal'), false];
  }

  if (clientId && booking[2] !== clientId) {
    return [new Error('Unauthorized: client mismatch'), false];
  }

  await tx`
    UPDATE bookings
    SET status = ${newStatus},
        cancelled_by = ${newStatus === 'cancelled' ? actor : null},
        updated_at = NOW()
    WHERE booking_id = ${bookingId}::uuid
  `;

  await tx`
    INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason)
    VALUES (${bookingId}::uuid, ${booking[1] ?? 'unknown'}, ${newStatus}, ${actor},
            ${clientId ?? null},
            ${newStatus === 'cancelled' ? 'Cancelled via Telegram inline button' : 'Status updated via Telegram'})
  `;

  return [null, true];
}

export async function updateReminderPreferences(
  tx: postgres.Sql,
  clientId: string,
  activate: boolean
): Promise<[Error | null, boolean]> {
  const defaults = activate
    ? '{"telegram_24h": true, "gmail_24h": true, "telegram_2h": true, "telegram_30min": true}'
    : '{"telegram_24h": false, "gmail_24h": false, "telegram_2h": false, "telegram_30min": false}';

  await tx`
    UPDATE clients
    SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{reminder_preferences}',
          ${defaults}::jsonb
        ),
        updated_at = NOW()
    WHERE client_id = ${clientId}::uuid
  `;

  return [null, true];
}

export async function confirmBooking(
  tx: postgres.Sql,
  bookingId: string,
  clientId: string | undefined
): Promise<[Error | null, boolean]> {
  const bookings = await tx.values<[string, string, string]>`
    SELECT booking_id, status, client_id
    FROM bookings
    WHERE booking_id = ${bookingId}::uuid
      AND status = 'pending'
    LIMIT 1
  `;

  const booking = bookings[0];
  if (booking === undefined) {
    return [new Error('Booking not found or not in pending status'), false];
  }

  if (clientId && booking[2] !== clientId) {
    return [new Error('Unauthorized: client mismatch'), false];
  }

  await tx`
    UPDATE bookings
    SET status = 'confirmed',
        updated_at = NOW()
    WHERE booking_id = ${bookingId}::uuid
  `;

  await tx`
    INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason)
    VALUES (${bookingId}::uuid, ${booking[1] ?? 'unknown'}, 'confirmed', 'client',
            ${clientId ?? null}, 'Confirmed via Telegram inline button')
  `;

  return [null, true];
}