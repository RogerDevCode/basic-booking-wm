import postgres from 'postgres';

export async function confirmBooking(tx: postgres.Sql, bookingId: string, clientId: string | undefined): Promise<[Error | null, boolean]> {
    const bookings = await tx.values<[string, string, string][]>`
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
