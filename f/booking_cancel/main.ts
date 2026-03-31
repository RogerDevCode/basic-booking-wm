import { z } from "zod";
import "@total-typescript/ts-reset";
import { CancelBookingRequestSchema } from "../../internal/schemas";
import { Result, ok, err, BookingID } from "../../internal/types/domain";
import { getDbPool } from "../../internal/db";
import postgres from "postgres";

type CancelBookingResponse = {
  readonly booking_id: BookingID;
  readonly status: string;
  readonly cancelled: boolean;
};

export async function main(rawInput: unknown): Promise<Result<CancelBookingResponse, Error>> {
  // 1. Boundary Validation
  const inputParsed = CancelBookingRequestSchema.safeParse(rawInput);
  if (!inputParsed.success) {
    return err(new Error(`Invalid input: ${inputParsed.error.message}`));
  }

  const input = inputParsed.data;

  try {
    const sql = getDbPool();

    // 2. TRANSACTIONAL SAFETY
    return await sql.begin(async (tx) => {
      
      // A. Check if booking exists
      const existing = await tx`
        SELECT booking_id, status 
        FROM bookings 
        WHERE booking_id = ${input.booking_id}
        FOR UPDATE
      `;

      if (existing.length === 0) {
        throw new Error("Booking not found");
      }

      const currentStatus = String(existing[0]!.status);

      // B. Check if already cancelled
      if (currentStatus === 'cancelled') {
         throw new Error("Booking is already cancelled");
      }

      // C. Cancel Booking
      const updateRows = await tx`
        UPDATE bookings 
        SET 
          status = 'cancelled',
          cancellation_reason = ${input.cancellation_reason ?? null},
          updated_at = NOW(),
          cancelled_at = NOW()
        WHERE booking_id = ${input.booking_id}
        RETURNING booking_id, status
      `;

      if (updateRows.length === 0) {
        throw new Error("Failed to cancel booking - update returned no rows");
      }

      const row = updateRows[0] as { booking_id: BookingID, status: string };

      return ok({
        booking_id: row.booking_id,
        status: row.status,
        cancelled: true
      });
    });

  } catch (error: unknown) {
    if (error instanceof postgres.PostgresError) {
      return err(new Error(`Database error: ${error.message}`));
    }
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
