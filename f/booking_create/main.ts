import "@total-typescript/ts-reset";
import { CreateBookingRequestSchema } from "../../internal/schemas";
import { Result, ok, err, BookingID, ProviderID, ServiceID, PatientID } from "../../internal/types/domain";
import { getDatabasePool } from "../../internal/db";
import postgres from "postgres";

interface CreateBookingResponse {
  readonly id: BookingID;
  readonly status: string;
  readonly provider_id: ProviderID;
  readonly service_id: ServiceID;
  readonly start_time: string;
  readonly end_time: string;
  readonly is_duplicate: boolean;
}

interface BookingRow {
  readonly booking_id: BookingID;
  readonly status: string;
}

interface PatientRow {
  readonly patient_id: PatientID;
}

interface ServiceRow {
  readonly duration_minutes: number;
}

export async function main(rawInput: unknown): Promise<Result<CreateBookingResponse, Error>> {
  // 1. Boundary Validation
  const inputParsed = CreateBookingRequestSchema.safeParse(rawInput);
  if (!inputParsed.success) {
    return err(new Error(`Invalid input: ${inputParsed.error.message}`));
  }

  const input = inputParsed.data;

  try {
    const sql = getDatabasePool();

    // 2. Generate Idempotency Key
    const idempotencyKey = `${input.service_id}-${input.start_time}-${input.chat_id}`;

    // 3. TRANSACTIONAL SAFETY (Serializable)
    return await sql.begin(async (tx): Promise<Result<CreateBookingResponse, Error>> => {
      // Set transaction isolation level
      await tx`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;
      
      // A. Check Idempotency
      const existing = await tx<BookingRow[]>`
        SELECT booking_id, status 
        FROM bookings 
        WHERE idempotency_key = ${idempotencyKey}
      `;

      if (existing.length > 0) {
        const row = existing[0];
        if (row) {
          return ok({
            id: row.booking_id,
            status: row.status,
            provider_id: input.provider_id,
            service_id: input.service_id,
            start_time: input.start_time,
            end_time: input.start_time,
            is_duplicate: true
          });
        }
      }

      // B. Resolve Patient ID (Create if not exists)
      const patientRows = await tx<PatientRow[]>`
        INSERT INTO patients (name, email, telegram_chat_id)
        VALUES (
          ${input.user_name ?? 'Paciente'}, 
          ${input.user_email ?? null}, 
          ${input.chat_id}
        )
        ON CONFLICT (telegram_chat_id) DO UPDATE SET updated_at = NOW()
        RETURNING patient_id
      `;
      
      const patientId = patientRows[0]?.patient_id;
      if (!patientId) {
        throw new Error("Failed to resolve patient_id");
      }

      // C. Get Service Duration to calculate End Time
      const serviceRows = await tx<ServiceRow[]>`
        SELECT duration_minutes 
        FROM services 
        WHERE service_id = ${input.service_id} AND is_active = true
      `;

      const durationMinutes = serviceRows[0]?.duration_minutes;
      if (durationMinutes === undefined) {
        throw new Error("Service not found or inactive");
      }
      
      const startTimeDate = new Date(input.start_time);
      const endTimeDate = new Date(startTimeDate.getTime() + Number(durationMinutes) * 60_000);
      const endTimeStr = endTimeDate.toISOString();

      // D. Check Availability with lock
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
      const bookingRows = await tx<BookingRow[]>`
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

      const createdRow = bookingRows[0];
      if (!createdRow) {
        throw new Error("Failed to insert booking");
      }

      // Return result
      return ok({
        id: createdRow.booking_id,
        status: createdRow.status,
        provider_id: input.provider_id,
        service_id: input.service_id,
        start_time: input.start_time,
        end_time: endTimeStr,
        is_duplicate: false
      });
    });

  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    if (error instanceof postgres.PostgresError) {
      if (error.code === '23P01' || error.code === '40001') {
        return err(new Error("Slot unavailable - concurrency conflict"));
      }
      return err(new Error(`Database error: ${error.message}`));
    }
    return err(error);
  }
}
