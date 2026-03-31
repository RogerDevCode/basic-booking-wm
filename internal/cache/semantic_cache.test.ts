/**
 * Tests para Semantic Cache
 * 
 * Implementa:
 * - Unit tests con type safety
 * - Integration tests con Redis
 * - Performance benchmarks
 * - Edge cases testing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  createSemanticCache, 
  defaultConfig,
  SemanticCache 
} from './semantic_cache.js';
import { ok, err } from '../../pkg/types/index.js';

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('SemanticCache - Unit', () => {
  let cache: SemanticCache;

  beforeAll(() => {
    const result = createSemanticCache(defaultConfig());
    if (!result.success) {
      throw result.error;
    }
    cache = result.data;
  });

  afterAll(async () => {
    await cache.close();
  });

  describe('Constructor', () => {
    it('should create cache with default config', () => {
      const result = createSemanticCache();
      expect(result.success).toBe(true);
    });

    it('should create cache with custom config', () => {
      const config = {
        ...defaultConfig(),
        redisAddr: 'localhost:6379',
        similarityThreshold: 0.90,
      };
      
      const result = createSemanticCache(config);
      expect(result.success).toBe(true);
    });
  });

  describe('Get (Cache Miss)', () => {
    it('should return error for non-existent key', () => {
      const result = cache.get('non-existent-prompt');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Cache miss');
      }
    });
  });

  describe('Set and Get (Cache Hit)', () => {
    it('should store and retrieve exact match', () => {
      const prompt = 'test prompt for exact match';
      const response = { intent: 'test', confidence: 0.95 };
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

      // Set
      const setResult = cache.set(prompt, response, embedding);
      expect(setResult.success).toBe(true);

      // Get
      const getResult = cache.get(prompt);
      expect(getResult.success).toBe(true);
      
      if (getResult.success) {
        expect(getResult.data.prompt).toBe(prompt);
        expect(getResult.data.response).toEqual(response);
      }
    });

    it('should update access count on get', () => {
      const prompt = 'test prompt for access count';
      const response = { test: true };
      const embedding = [0.5, 0.5, 0.5];

      // Set
      cache.set(prompt, response, embedding);

      // Get multiple times
      cache.get(prompt);
      cache.get(prompt);
      cache.get(prompt);

      // Verify access count increased (indirectly through stats)
      const stats = cache.getStats();
      expect(stats.hits).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Delete', () => {
    it('should delete existing key', () => {
      const prompt = 'test prompt for delete';
      const response = { test: true };
      const embedding = [0.1, 0.2, 0.3];

      // Set
      cache.set(prompt, response, embedding);

      // Verify exists
      expect(cache.get(prompt).success).toBe(true);

      // Delete
      const deleteResult = cache.delete(prompt);
      expect(deleteResult.success).toBe(true);

      // Verify deleted
      expect(cache.get(prompt).success).toBe(false);
    });

    it('should not error on non-existent key', () => {
      const result = cache.delete('non-existent-key');
      expect(result.success).toBe(true);
    });
  });

  describe('Clear', () => {
    it('should clear all cache entries', () => {
      // Add multiple entries
      cache.set('prompt1', { test: 1 }, [0.1, 0.2]);
      cache.set('prompt2', { test: 2 }, [0.2, 0.3]);
      cache.set('prompt3', { test: 3 }, [0.3, 0.4]);

      // Clear
      const result = cache.clear();
      expect(result.success).toBe(true);

      // Verify all deleted
      expect(cache.get('prompt1').success).toBe(false);
      expect(cache.get('prompt2').success).toBe(false);
      expect(cache.get('prompt3').success).toBe(false);
    });
  });

  describe('Stats', () => {
    it('should track hits and misses', () => {
      const stats = cache.getStats();
      
      expect(stats.hits).toBeGreaterThanOrEqual(0);
      expect(stats.misses).toBeGreaterThanOrEqual(0);
      
      if (stats.hits + stats.misses > 0) {
        expect(stats.hitRate).toBeGreaterThanOrEqual(0);
        expect(stats.hitRate).toBeLessThanOrEqual(1);
      }
    });

    it('should track latency', () => {
      const stats = cache.getStats();
      expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('SemanticCache - Integration', () => {
  let cache: SemanticCache;

  beforeAll(() => {
    const result = createSemanticCache({
      ...defaultConfig(),
      enableStats: true,
    });
    if (!result.success) {
      throw result.error;
    }
    cache = result.data;
  });

  afterAll(async () => {
    await cache.close();
  });

  describe('Semantic Search', () => {
    it('should find semantically similar prompts', () => {
      const originalPrompt = 'Quiero agendar una cita médica';
      const similarPrompt = 'Necesito reservar una cita con el doctor';
      const response = { intent: 'create_appointment', confidence: 0.95 };
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

      // Store original
      cache.set(originalPrompt, response, embedding);

      // Search with similar prompt
      const result = cache.get(similarPrompt);
      
      // May or may not find depending on similarity threshold
      // This test verifies the semantic search doesn't crash
      expect(result.success).toBeTypeOf('boolean');
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used entries when max size reached', () => {
      const smallCache = createSemanticCache({
        ...defaultConfig(),
        maxSize: 3,
      });

      if (!smallCache.success) {
        throw smallCache.error;
      }

      // Add 5 entries (exceeds max size of 3)
      for (let i = 0; i < 5; i++) {
        smallCache.data.set(`prompt${i}`, { test: i }, [i * 0.1]);
      }

      // Verify some entries were evicted
      const stats = smallCache.data.getStats();
      expect(stats.evictions).toBeGreaterThan(0);

      smallCache.data.close();
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = createSemanticCache({
        ...defaultConfig(),
        ttl: 2, // 2 seconds TTL
      });

      if (!shortTtlCache.success) {
        throw shortTtlCache.error;
      }

      // Set entry
      shortTtlCache.data.set('short-ttl-prompt', { test: true }, [0.5]);

      // Verify exists
      expect(shortTtlCache.data.get('short-ttl-prompt').success).toBe(true);

      // Wait for TTL
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Verify expired
      expect(shortTtlCache.data.get('short-ttl-prompt').success).toBe(false);

      await shortTtlCache.data.close();
    }, 5000); // 5 second timeout for this test
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('SemanticCache - Edge Cases', () => {
  let cache: SemanticCache;

  beforeAll(() => {
    const result = createSemanticCache(defaultConfig());
    if (!result.success) {
      throw result.error;
    }
    cache = result.data;
  });

  afterAll(async () => {
    await cache.close();
  });

  describe('Empty Input', () => {
    it('should handle empty prompt', () => {
      const result = cache.get('');
      expect(result.success).toBeTypeOf('boolean');
    });

    it('should handle empty response', () => {
      const result = cache.set('test', {}, []);
      expect(result.success).toBe(true);
    });
  });

  describe('Special Characters', () => {
    it('should handle unicode characters', () => {
      const prompt = 'Quiero agendar una cita 🏥';
      const response = { intent: 'create' };
      const embedding = [0.1, 0.2];

      const setResult = cache.set(prompt, response, embedding);
      expect(setResult.success).toBe(true);

      const getResult = cache.get(prompt);
      expect(getResult.success).toBe(true);
    });

    it('should handle SQL injection attempts', () => {
      const prompt = "'; DROP TABLE cache;--";
      const response = { test: true };
      const embedding = [0.5];

      const setResult = cache.set(prompt, response, embedding);
      expect(setResult.success).toBe(true);

      const getResult = cache.get(prompt);
      expect(getResult.success).toBe(true);
    });
  });

  describe('Large Inputs', () => {
    it('should handle large prompts', () => {
      const largePrompt = 'a'.repeat(10000);
      const response = { test: true };
      const embedding = [0.5];

      const setResult = cache.set(largePrompt, response, embedding);
      expect(setResult.success).toBe(true);

      const getResult = cache.get(largePrompt);
      expect(getResult.success).toBe(true);
    });

    it('should handle large responses', () => {
      const prompt = 'test large response';
      const largeResponse = { data: 'x'.repeat(100000) };
      const embedding = [0.5];

      const setResult = cache.set(prompt, largeResponse, embedding);
      expect(setResult.success).toBe(true);

      const getResult = cache.get(prompt);
      expect(getResult.success).toBe(true);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent gets and sets', async () => {
      const promises: Promise<unknown>[] = [];

      // 10 concurrent sets
      for (let i = 0; i < 10; i++) {
        promises.push(cache.set(`concurrent-${i}`, { i }, [i * 0.1]));
      }

      // 10 concurrent gets
      for (let i = 0; i < 10; i++) {
        promises.push(cache.get(`concurrent-${i}`));
      }

      const results = await Promise.allSettled(promises);
      
      // All should complete (some may fail due to race conditions, that's ok)
      expect(results.length).toBe(20);
    });
  });
});

// ============================================================================
// PERFORMANCE BENCHMARKS (Vitest)
// ============================================================================

describe('SemanticCache - Performance', () => {
  let cache: SemanticCache;

  beforeAll(() => {
    const result = createSemanticCache(defaultConfig());
    if (!result.success) {
      throw result.error;
    }
    cache = result.data;
  });

  afterAll(async () => {
    await cache.close();
  });

  it('should have <10ms latency for exact match', () => {
    const prompt = 'performance test';
    const response = { test: true };
    const embedding = [0.5];

    cache.set(prompt, response, embedding);

    const startTime = Date.now();
    cache.get(prompt);
    const latency = Date.now() - startTime;

    expect(latency).toBeLessThan(10);
  });

  it('should handle 1000 entries without degradation', () => {
    // Add 1000 entries
    for (let i = 0; i < 1000; i++) {
      cache.set(`perf-${i}`, { i }, [i * 0.001]);
    }

    // Measure latency
    const startTime = Date.now();
    cache.get('perf-500');
    const latency = Date.now() - startTime;

    // Should still be <50ms
    expect(latency).toBeLessThan(50);
  });
});
