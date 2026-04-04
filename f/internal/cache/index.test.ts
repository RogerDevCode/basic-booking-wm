import { describe, test, expect, vi, beforeEach } from "vitest";

describe("Semantic Cache", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env["REDIS_URL"] = "redis://localhost:6379";
  });

  test("Debe fallar sin REDIS_URL", async () => {
    delete process.env["REDIS_URL"];
    const { cacheGet } = await import("./index");
    const [err, data] = await cacheGet("test query");
    expect(err).not.toBeNull();
    expect(data).toBeNull();
  });

  test("Debe retornar null para cache miss", async () => {
    vi.doMock("ioredis", () => {
      return {
        default: vi.fn().mockImplementation(() => ({
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue("OK"),
          del: vi.fn().mockResolvedValue(1),
          keys: vi.fn().mockResolvedValue([]),
          quit: vi.fn().mockResolvedValue(undefined),
        })),
      };
    });

    const { cacheGet } = await import("./index");
    const [err, data] = await cacheGet("una consulta nueva");
    expect(err).toBeNull();
    expect(data).toBeNull();
  });

  test("Debe retornar entry para cache hit", async () => {
    const cachedEntry = JSON.stringify({
      query_hash: "abc123",
      response: "Hola, soy tu asistente médico.",
      intent: "greeting",
      created_at: "2026-04-04T10:00:00.000Z",
      ttl_seconds: 3600,
    });

    vi.doMock("ioredis", () => {
      return {
        default: vi.fn().mockImplementation(() => ({
          get: vi.fn().mockResolvedValue(cachedEntry),
          set: vi.fn().mockResolvedValue("OK"),
          del: vi.fn().mockResolvedValue(1),
          keys: vi.fn().mockResolvedValue([]),
          quit: vi.fn().mockResolvedValue(undefined),
        })),
      };
    });

    const { cacheGet } = await import("./index");
    const [err, data] = await cacheGet("hola");

    expect(err).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.intent).toBe("greeting");
    expect(data?.response).toBe("Hola, soy tu asistente médico.");
  });

  test("Debe guardar entry en cache", async () => {
    vi.doMock("ioredis", () => {
      return {
        default: vi.fn().mockImplementation(() => ({
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue("OK"),
          del: vi.fn().mockResolvedValue(1),
          keys: vi.fn().mockResolvedValue([]),
          quit: vi.fn().mockResolvedValue(undefined),
        })),
      };
    });

    const { cacheSet } = await import("./index");
    const [err] = await cacheSet("hola", "Hola! ¿Cómo puedo ayudarte?", "greeting", 1800);

    expect(err).toBeNull();
  });

  test("Debe invalidar entry de cache", async () => {
    vi.doMock("ioredis", () => {
      return {
        default: vi.fn().mockImplementation(() => ({
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue("OK"),
          del: vi.fn().mockResolvedValue(1),
          keys: vi.fn().mockResolvedValue([]),
          quit: vi.fn().mockResolvedValue(undefined),
        })),
      };
    });

    const { cacheInvalidate } = await import("./index");
    const [err] = await cacheInvalidate("hola");

    expect(err).toBeNull();
  });

  test("Debe retornar stats de cache", async () => {
    vi.doMock("ioredis", () => {
      return {
        default: vi.fn().mockImplementation(() => ({
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue("OK"),
          del: vi.fn().mockResolvedValue(1),
          keys: vi.fn().mockResolvedValue(["booking:llm_cache:abc", "booking:llm_cache:def"]),
          quit: vi.fn().mockResolvedValue(undefined),
        })),
      };
    });

    const { cacheStats } = await import("./index");
    const [err, stats] = await cacheStats();

    expect(err).toBeNull();
    expect(stats?.keys).toBe(2);
  });

  test("Debe limpiar cache", async () => {
    vi.doMock("ioredis", () => {
      return {
        default: vi.fn().mockImplementation(() => ({
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue("OK"),
          del: vi.fn().mockResolvedValue(1),
          keys: vi.fn().mockResolvedValue(["booking:llm_cache:abc"]),
          quit: vi.fn().mockResolvedValue(undefined),
        })),
      };
    });

    const { cacheClear } = await import("./index");
    const [err, deleted] = await cacheClear();

    expect(err).toBeNull();
    expect(deleted).toBe(1);
  });
});
