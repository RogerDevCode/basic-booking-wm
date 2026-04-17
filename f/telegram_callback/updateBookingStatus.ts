import postgres from 'postgres';

export async function updateBookingStatus(tx: postgres.Sql, bookingId: string, newStatus: string, clientId: string | undefined, actor: string): Promise<[Error | null, boolean]> {
    const bookings = await tx.values<[string, string, string, string, string][]>`
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
