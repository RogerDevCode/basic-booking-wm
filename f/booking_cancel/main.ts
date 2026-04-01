import "@total-typescript/ts-reset";
import { CancelBookingRequestSchema } from "../../internal/schemas";
import { Result, ok, err, BookingID } from "../../internal/types/domain";
import { getDatabasePool } from "../../internal/db";
import postgres from "postgres";

interface CancelBookingResponse {
  readonly booking_id: BookingID;
  readonly status: string;
  readonly cancelled: boolean;
}

interface BookingRow {
  readonly booking_id: BookingID;
  readonly status: string;
}

export async function main(rawInput: unknown): Promise<Result<CancelBookingResponse, Error>> {
  // 1. Boundary Validation
  const inputParsed = CancelBookingRequestSchema.safeParse(rawInput);
  if (!inputParsed.success) {
    return err(new Error(`Invalid input: ${inputParsed.error.message}`));
  }

  const input = inputParsed.data;

  try {
    const sql = getDatabasePool();

    // 2. TRANSACTIONAL SAFETY
    return await sql.begin(async (tx): Promise<Result<CancelBookingResponse, Error>> => {
      
      // A. Check if booking exists
      const existing = await tx<BookingRow[]>`
        SELECT booking_id, status 
        FROM bookings 
        WHERE booking_id = ${input.booking_id}
        FOR UPDATE
      `;

      const row = existing[0];
      if (!row) {
        throw new Error("Booking not found");
      }

      const currentStatus = String(row.status);

      // B. Check if already cancelled
      if (currentStatus === 'cancelled') {
         throw new Error("Booking is already cancelled");
      }

      // C. Cancel Booking
      const updateRows = await tx<BookingRow[]>`
        UPDATE bookings 
        SET 
          status = 'cancelled',
          cancellation_reason = ${input.cancellation_reason ?? null},
          updated_at = NOW(),
          cancelled_at = NOW()
        WHERE booking_id = ${input.booking_id}
        RETURNING booking_id, status
      `;

      const updatedRow = updateRows[0];
      if (!updatedRow) {
        throw new Error("Failed to cancel booking - update returned no rows");
      }

      return ok({
        booking_id: updatedRow.booking_id,
        status: updatedRow.status,
        cancelled: true
      });
    });

  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    
    // Check for postgres error specifically without unsafe member access
    if (error instanceof postgres.PostgresError) {
      return err(new Error(`Database error: ${error.message}`));
    }
    return err(error);
  }
}
