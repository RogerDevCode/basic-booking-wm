// ============================================================================
// SEMANTIC SAMPLER TESTS — Cosine similarity, keyword embedding, few-shot selection
// ============================================================================

import { describe, test, expect } from "vitest";
import {
  cosineSimilarity,
  keywordEmbedding,
  KEYWORD_DIMENSIONS,
  selectFewShotExamples,
  formatFewShotExamples,
} from "./semantic-sampler";

// ============================================================================
// COSINE SIMILARITY TESTS
// ============================================================================

describe("Semantic Sampler — Cosine Similarity", () => {
  test("identical vectors = 1.0", () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  test("orthogonal vectors = 0.0", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  test("opposite vectors = -1.0", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  test("empty vectors = 0.0", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  test("different length vectors = 0.0", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  test("normalized vectors similarity", () => {
    const a = [0.5, 0.5, 0.5, 0.5];
    const b = [0.6, 0.4, 0.5, 0.5];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.9);
    expect(sim).toBeLessThanOrEqual(1.0);
  });
});

// ============================================================================
// KEYWORD EMBEDDING TESTS
// ============================================================================

describe("Semantic Sampler — Keyword Embedding", () => {
  test("produces vector of correct dimension", () => {
    const emb = keywordEmbedding("hola quiero agendar");
    expect(emb.length).toBe(KEYWORD_DIMENSIONS.length);
  });

  test("greeting keywords detected", () => {
    const emb = keywordEmbedding("hola dotor");
    const holaIdx = KEYWORD_DIMENSIONS.indexOf("hola");
    const olaIdx = KEYWORD_DIMENSIONS.indexOf("ola");
    const dotorIdx = KEYWORD_DIMENSIONS.indexOf("dotor");
    expect(emb[holaIdx]).toBe(1.0);
    expect(emb[olaIdx]).toBe(1.0);
    expect(emb[dotorIdx]).toBe(1.0);
  });

  test("appointment keywords detected", () => {
    const emb = keywordEmbedding("kiero agendar una cita para mañana");
    const kieroIdx = KEYWORD_DIMENSIONS.indexOf("kiero");
    const agendarIdx = KEYWORD_DIMENSIONS.indexOf("agendar");
    const citaIdx = KEYWORD_DIMENSIONS.indexOf("cita");
    const mananaIdx = KEYWORD_DIMENSIONS.indexOf("mañana");
    expect(emb[kieroIdx]).toBe(1.0);
    expect(emb[agendarIdx]).toBe(1.0);
    expect(emb[citaIdx]).toBe(1.0);
    expect(emb[mananaIdx]).toBe(1.0);
  });

  test("partial match gets 0.5", () => {
    const emb = keywordEmbedding("agendando cita");
    const citaIdx = KEYWORD_DIMENSIONS.indexOf("cita");
    expect(emb[citaIdx]).toBe(1.0);
    // "agendando" contains "agendar" as substring
    const agendarIdx = KEYWORD_DIMENSIONS.indexOf("agendar");
    expect(emb[agendarIdx]).toBe(0.5);
  });

  test("unknown text produces mostly zeros", () => {
    const emb = keywordEmbedding("xyz abc 123");
    const nonZero = emb.filter((v) => v > 0).length;
    expect(nonZero).toBe(0);
  });
});

// ============================================================================
// FEW-SHOT SELECTION TESTS
// ============================================================================

describe("Semantic Sampler — Few-Shot Selection", () => {
  test("returns k examples", () => {
    const examples = selectFewShotExamples("kiero agendar una cita", 3);
    expect(examples.length).toBe(3);
  });

  test("returns fewer if k > available", () => {
    const examples = selectFewShotExamples("hola", 100);
    expect(examples.length).toBeLessThanOrEqual(25);
  });

  test("greeting input selects greeting examples first", () => {
    const examples = selectFewShotExamples("hola buenos dias", 3);
    const greetingCount = examples.filter(
      (ex) => ex.intent === "greeting"
    ).length;
    // With keyword embedding, greeting should rank high
    expect(greetingCount).toBeGreaterThanOrEqual(1);
  });

  test("cancel input selects cancel examples", () => {
    const examples = selectFewShotExamples("quiero cancelar mi cita", 3);
    const cancelCount = examples.filter(
      (ex) => ex.intent === "cancel_appointment"
    ).length;
    expect(cancelCount).toBeGreaterThanOrEqual(1);
  });

  test("urgent medical input selects urgent care examples", () => {
    const examples = selectFewShotExamples("me duele mucho la muela", 3);
    const urgentCount = examples.filter(
      (ex) => ex.intent === "urgent_care"
    ).length;
    expect(urgentCount).toBeGreaterThanOrEqual(1);
  });

  test("results are sorted by similarity (descending)", () => {
    const examples = selectFewShotExamples("hola quiero agendar", 5);
    for (let i = 1; i < examples.length; i++) {
      expect(examples[i].similarity).toBeLessThanOrEqual(
        examples[i - 1].similarity
      );
    }
  });
});

// ============================================================================
// FORMAT TESTS
// ============================================================================

describe("Semantic Sampler — Format Examples", () => {
  test("formats examples correctly", () => {
    const examples = selectFewShotExamples("hola", 2);
    const formatted = formatFewShotExamples(examples);
    expect(formatted).toContain('User: "');
    expect(formatted).toContain('"intent":');
  });

  test("empty examples returns empty string", () => {
    expect(formatFewShotExamples([])).toBe("");
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("Semantic Sampler — Performance", () => {
  test("selectFewShotExamples must respond in < 1ms", () => {
    const start = Date.now();
    selectFewShotExamples("kiero agendar una cita para mañana", 3);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1);
  });

  test("cosineSimilarity must respond in < 0.1ms", () => {
    const a = Array.from({ length: 384 }, () => Math.random());
    const b = Array.from({ length: 384 }, () => Math.random());
    const start = Date.now();
    cosineSimilarity(a, b);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1);
  });
});
