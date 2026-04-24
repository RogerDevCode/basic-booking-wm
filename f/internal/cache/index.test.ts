import { describe, test, expect, vi, beforeEach } from "vitest";
import { INTENT } from '../ai_agent/constants.ts';

// Vitest 4: vi.hoisted shares state between vi.mock factory and test code
const { mockRedis } = vi.hoisted(() => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    quit: vi.fn(),
  };
  return { mockRedis };
});

vi.mock("ioredis", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  default: vi.fn(function MockRedis() { return mockRedis; }),
}));

import { cacheGet, cacheSet, cacheInvalidate, cacheStats, cacheClear } from "./index.ts";

describe("Semantic Cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["REDIS_URL"] = "redis://localhost:6379";
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.del.mockResolvedValue(1);
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.quit.mockResolvedValue(undefined);
  });

  test("Debe fallar sin REDIS_URL", async () => {
    const savedUrl = process.env["REDIS_URL"];
    delete process.env["REDIS_URL"];
    try {
      const [err, data] = await cacheGet("test query");
      expect(err).not.toBeNull();
      expect(data).toBeNull();
    } finally {
      if (savedUrl !== undefined) process.env["REDIS_URL"] = savedUrl;
    }
  });

  test("Debe retornar null para cache miss", async () => {
    const [err, data] = await cacheGet("una consulta nueva");
    expect(err).toBeNull();
    expect(data).toBeNull();
  });

  test("Debe retornar entry para cache hit", async () => {
    const cachedEntry = JSON.stringify({
      query_hash: "abc123",
      response: "Hola, soy tu asistente médico.",
      intent: INTENT.SALUDO,
      created_at: "2026-04-04T10:00:00.000Z",
      ttl_seconds: 3600,
    });
    mockRedis.get.mockResolvedValue(cachedEntry);

    const [err, data] = await cacheGet("hola");
    expect(err).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.intent).toBe(INTENT.SALUDO);
    expect(data?.response).toBe("Hola, soy tu asistente médico.");
  });

  test("Debe guardar entry en cache", async () => {
    const [err] = await cacheSet("hola", "Hola! ¿Cómo puedo ayudarte?", INTENT.SALUDO, 1800);
    expect(err).toBeNull();
  });

  test("Debe invalidar entry de cache", async () => {
    const [err] = await cacheInvalidate("hola");
    expect(err).toBeNull();
  });

  test("Debe retornar stats de cache", async () => {
    mockRedis.keys.mockResolvedValue(["booking:llm_cache:abc", "booking:llm_cache:def"]);

    const [err, stats] = await cacheStats();
    expect(err).toBeNull();
    expect(stats?.keys).toBe(2);
  });

  test("Debe limpiar cache", async () => {
    mockRedis.keys.mockResolvedValue(["booking:llm_cache:abc"]);
    mockRedis.del.mockResolvedValue(1);

    const [err, deleted] = await cacheClear();
    expect(err).toBeNull();
    expect(deleted).toBe(1);
  });
});
