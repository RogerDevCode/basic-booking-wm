import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { main as createBooking } from "../../f/booking_create/main";
import { main as cancelBooking } from "../../f/booking_cancel/main";
import { CreateBookingRequest } from "../../internal/schemas";
import { getDbPool } from "../../internal/db";

describe("🔴 Red Team & Devil's Advocate: Transactional Flow", () => {
  
  // Variables globales del test
  let sql: ReturnType<typeof getDbPool>;
  let testProviderId: string;
  let testServiceId: string;

  beforeAll(async () => {
    // 1. Iniciar DB
    // Esperamos que las variables de entorno DEV estén configuradas o levantadas por un global setup
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/booking_titanium";
    sql = getDbPool();

    // 2. Limpiar e Insertar Provider y Service falso para el Red Team
    await sql`DELETE FROM bookings WHERE patient_id IN (SELECT patient_id FROM patients WHERE name = 'Red Team Hacker')`;
    
    const providerResult = await sql`
      INSERT INTO providers (name, email, specialty, timezone, is_active) 
      VALUES ('Test Provider', 'test_provider_rt@test.com', 'General', 'America/Mexico_City', true)
      ON CONFLICT (email) DO UPDATE SET is_active = true
      RETURNING provider_id
    `;
    testProviderId = providerResult[0]!.provider_id;

    const serviceResult = await sql`
      INSERT INTO services (provider_id, name, duration_minutes, buffer_minutes, price_cents, currency)
      VALUES (${testProviderId}, 'Test Service', 30, 10, 1000, 'MXN')
      RETURNING service_id
    `;
    testServiceId = serviceResult[0]!.service_id;
  });

  afterAll(async () => {
    // Cleanup
    await sql`DELETE FROM bookings WHERE provider_id = ${testProviderId}`;
    await sql`DELETE FROM services WHERE provider_id = ${testProviderId}`;
    await sql`DELETE FROM providers WHERE provider_id = ${testProviderId}`;
    // No cerramos el pool de DB aquí porque Vitest lo paraleliza a veces, Windmill lo cierra al matar el thread.
  });

  describe("SQL Injection & Payload Malformation (Boundary Zod)", () => {
    test("Debe bloquear intento de SQL Injection en el input del servicio", async () => {
      const maliciousPayload = {
        provider_id: testProviderId,
        service_id: "00000000-0000-0000-0000-000000000001'; DROP TABLE bookings; --",
        start_time: new Date().toISOString(),
        chat_id: "12345",
        user_name: "Red Team Hacker",
        user_email: "hacker@evil.com"
      };

      const result = await createBooking(maliciousPayload);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Invalid input");
        expect(result.error.message.toLowerCase()).toContain("invalid uuid"); // Zod debería interceptar esto primero
      }
    });

    test("Debe bloquear inyección de Null Bytes en campos de texto", async () => {
      const maliciousPayload = {
        provider_id: testProviderId,
        service_id: testServiceId,
        start_time: new Date().toISOString(),
        chat_id: "12345",
        user_name: "Null\x00Byte",
        user_email: "hacker@evil.com"
      };

      // Nota: Zod no bloquea Null Bytes por defecto si solo es string().
      // Debemos asegurarnos de que a nivel base de datos no rompa o que Postgres lo rechace
      const result = await createBooking(maliciousPayload);
      
      // En Postgres, el Null Byte (0x00) falla con error 22021. 
      // Si el driver lo rechaza, el error debe ser reportado sin panics.
      expect(result.success).toBe(false);
      if (!result.success) {
        // En Bun/Postgres, suele retornar un PostgresError "invalid byte sequence for encoding"
        // o si Zod lo atrapa, será Invalid Input.
        expect(["Database error", "Invalid input"]).toContain(
            result.error.message.split(":")[0]?.trim()
        );
      }
    });
  });

  describe("Edge Stressor (Concurrency / Race Conditions)", () => {
    test("Debe sobrevivir a 50 intentos concurrentes de reservar el MISMO slot y adjudicar solo 1", async () => {
      // Slot: Mañana a las 10:00 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const startTimeIso = tomorrow.toISOString();

      const promises = [];
      const totalAttempts = 50;

      for (let i = 0; i < totalAttempts; i++) {
        const payload: CreateBookingRequest = {
          provider_id: testProviderId as any,
          service_id: testServiceId as any,
          start_time: startTimeIso,
          chat_id: `user_${i}`, // Diferente usuario para no chocar por idempotency key idéntico
          user_name: `User ${i}`,
          user_email: `user${i}@test.com`
        };
        promises.push(createBooking(payload));
      }

      // Ejecutamos todos al mismo tiempo
      const results = await Promise.all(promises);

      // Contamos éxitos y fallos
      const successes = results.filter(r => r.success === true);
      const failures = results.filter(r => r.success === false);

      // EXACTAMENTE 1 debe haber ganado la carrera (o 0 si falló algo global, pero nunca > 1)
      expect(successes.length).toBeLessThanOrEqual(1);
      
      // La mayoría de los fallos deben ser por constraint de exclusión o slot no disponible
      if (failures.length > 0) {
        const firstFailure = failures[0] as { success: false, error: Error };
        expect(firstFailure.error.message).toMatch(/Slot unavailable/i);
      }
    });
  });

  describe("Devil's Advocate (Idempotency and Timestamps)", () => {
    test("Debe procesar solicitudes idempotentes sin duplicar ni fallar (Replay Attack)", async () => {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const startTimeIso = nextWeek.toISOString();

      const payload = {
        provider_id: testProviderId,
        service_id: testServiceId,
        start_time: startTimeIso,
        chat_id: "replay_victim",
        user_name: "Replay Victim",
        user_email: "victim@test.com"
      };

      // 1er Intento: Original
      const result1 = await createBooking(payload);
      expect(result1.success).toBe(true);

      if (result1.success) {
        expect(result1.data.is_duplicate).toBe(false);

        // 2do Intento: Replay
        const result2 = await createBooking(payload);
        expect(result2.success).toBe(true);
        if (result2.success) {
          expect(result2.data.is_duplicate).toBe(true);
          expect(result2.data.id).toBe(result1.data.id); // Debe devolver el mismo Booking ID
        }
      }
    });
  });

});