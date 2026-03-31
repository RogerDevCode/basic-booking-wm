import { z } from "zod";
import "@total-typescript/ts-reset";
import { CreateBookingRequestSchema } from "../../internal/schemas";
import { Result, ok, err, BookingID, ProviderID, ServiceID, PatientID } from "../../internal/types/domain";
import { getDbPool } from "../../internal/db";
import postgres from "postgres";

type CreateBookingResponse = {
  readonly id: BookingID;
  readonly status: string;
  readonly provider_id: ProviderID;
  readonly service_id: ServiceID;
  readonly start_time: string;
  readonly end_time: string;
  readonly is_duplicate: boolean;
};

export async function main(rawInput: unknown): Promise<Result<CreateBookingResponse, Error>> {
  // 1. Boundary Validation
  const inputParsed = CreateBookingRequestSchema.safeParse(rawInput);
  if (!inputParsed.success) {
    return err(new Error(`Invalid input: ${inputParsed.error.message}`));
  }

  const input = inputParsed.data;

  try {
    const sql = getDbPool();

    // 2. Generate Idempotency Key
    const idempotencyKey = `${input.service_id}-${input.start_time}-${input.chat_id}`;

    // 3. TRANSACTIONAL SAFETY (Serializable)
    return await sql.begin(async (tx) => {
      // Set transaction isolation level
      await tx`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;
      
      // A. Check Idempotency
      const existing = await tx`
        SELECT booking_id, status 
        FROM bookings 
        WHERE idempotency_key = ${idempotencyKey}
      `;

      if (existing.length > 0) {
        // Safe cast as we checked length
        const row = existing[0] as { booking_id: BookingID, status: string };
        return ok({
          id: row.booking_id,
          status: row.status,
          provider_id: input.provider_id,
          service_id: input.service_id,
          start_time: input.start_time,
          end_time: input.start_time, // Approximate, we don't have it here
          is_duplicate: true
        });
      }

      // B. Resolve Patient ID (Create if not exists)
      const patientRows = await tx`
        INSERT INTO patients (name, email, telegram_chat_id)
        VALUES (
          ${input.user_name ?? 'Paciente'}, 
          ${input.user_email ?? null}, 
          ${input.chat_id}
        )
        ON CONFLICT (telegram_chat_id) DO UPDATE SET updated_at = NOW()
        RETURNING patient_id
      `;
      
      if (patientRows.length === 0) {
        throw new Error("Failed to resolve patient_id");
      }
      const patientId = patientRows[0]!.patient_id as PatientID;

      // C. Get Service Duration to calculate End Time
      const serviceRows = await tx`
        SELECT duration_minutes 
        FROM services 
        WHERE service_id = ${input.service_id} AND is_active = true
      `;

      if (serviceRows.length === 0) {
        throw new Error("Service not found or inactive");
      }
      
      const durationMinutes = Number(serviceRows[0]!.duration_minutes);
      const startTimeDate = new Date(input.start_time);
      const endTimeDate = new Date(startTimeDate.getTime() + durationMinutes * 60000);
      const endTimeStr = endTimeDate.toISOString();

      // D. Check Availability with lock
      // Postgres EXCLUDE constraint handles the actual overlap check,
      // but we do a fast check here.
      const overlapCheck = await tx`
        SELECT booking_id 
        FROM bookings 
        WHERE provider_id = ${input.provider_id}
          AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
          AND start_time < ${endTimeStr}
          AND end_time > ${input.start_time}
        FOR UPDATE
      `;

      if (overlapCheck.length > 0) {
        throw new Error("Slot unavailable - overlap detected");
      }

      // E. Create Booking
      const bookingRows = await tx`
        INSERT INTO bookings (
          provider_id,
          patient_id,
          service_id,
          start_time,
          end_time,
          status,
          idempotency_key,
          user_id
        ) VALUES (
          ${input.provider_id},
          ${patientId},
          ${input.service_id},
          ${input.start_time},
          ${endTimeStr},
          'confirmed',
          ${idempotencyKey},
          ${input.chat_id}
        )
        RETURNING booking_id, status
      `;

      if (bookingRows.length === 0) {
        throw new Error("Failed to insert booking");
      }

      const row = bookingRows[0] as { booking_id: BookingID, status: string };

      // Return result
      return ok({
        id: row.booking_id,
        status: row.status,
        provider_id: input.provider_id,
        service_id: input.service_id,
        start_time: input.start_time,
        end_time: endTimeStr,
        is_duplicate: false
      });
    });

  } catch (e: unknown) {
    // We catch exceptions from the DB driver or our manual throws inside the transaction,
    // translating them into the Result monad pattern.
    if (e instanceof postgres.PostgresError) {
      if (e.code === '23P01' || e.code === '40001') { // Exclusion constraint or Serialization failure
        return err(new Error("Slot unavailable - concurrency conflict"));
      }
      return err(new Error(`Database error: ${e.message}`));
    }
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
