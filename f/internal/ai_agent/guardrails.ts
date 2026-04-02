// ============================================================================
// GUARDRAILS — Input/Output validation for LLM pipeline (v3.1)
// Pattern: Zero mocks, strict validation, no assertions
// ============================================================================

import { INTENT, URGENCY_WORDS } from './constants';
import type { GuardrailResult, IntentResult, IntentType } from './types';

// Prompt injection patterns
const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /developer\s+mode/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /disregard\s+instructions?/i,
  /you\s+are\s+now/i,
  /pretend\s+to\s+be/i,
  /forget\s+(all|your|the)\s+(instructions|rules|prompt)/i,
];

// Unicode attack vectors
const DANGEROUS_UNICODE: ReadonlyArray<string> = [
  '\u200B', // zero-width space
  '\u200E', // left-to-right mark
  '\u200F', // right-to-left mark
  '\u202A', // left-to-right embedding
  '\u202B', // right-to-left embedding
  '\u202D', // left-to-right override
  '\u202E', // right-to-left override
  '\uFEFF', // zero-width no-break space
];

// System prompt leakage patterns
const LEAKAGE_PATTERNS: ReadonlyArray<string> = [
  'SYSTEM_INSTRUCTIONS',
  'UNTRUSTED INPUT',
  'BEGIN USER DATA',
  'END USER DATA',
  'INTENT DEFINITIONS',
  'REGLAS DE DESEMPATE',
];

export function validateInput(text: string): GuardrailResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { kind: "blocked", reason: "Empty input", category: "length" };
  }
  if (trimmed.length > 500) {
    return { kind: "blocked", reason: "Input too long (max 500 chars)", category: "length" };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { kind: "blocked", reason: "Potential prompt injection detected", category: "injection" };
    }
  }

  for (const char of DANGEROUS_UNICODE) {
    if (trimmed.includes(char)) {
      return { kind: "blocked", reason: "Dangerous unicode character detected", category: "unicode" };
    }
  }

  return { kind: "pass" };
}

export function validateOutput(content: string): GuardrailResult {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { kind: "blocked", reason: "Empty LLM response", category: "length" };
  }
  if (trimmed.length > 4000) {
    return { kind: "blocked", reason: "LLM response too long", category: "length" };
  }

  for (const pattern of LEAKAGE_PATTERNS) {
    if (trimmed.includes(pattern)) {
      return { kind: "blocked", reason: "System prompt leakage detected", category: "leakage" };
    }
  }

  return { kind: "pass" };
}

export function sanitizeJSONResponse(raw: string): string {
  let cleaned = raw.trim();

  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

/**
 * Cross-checks urgency intent against text content.
 * Returns a tuple style [Error | null, IntentResult | null]
 */
export function verifyUrgency(result: IntentResult, text: string): IntentResult {
  if (result.intent === INTENT.URGENT_CARE) {
    const lower = text.toLowerCase();
    const hasUrgency = URGENCY_WORDS.some(w => lower.includes(w));
    if (!hasUrgency) {
      return { 
        ...result, 
        confidence: Math.min(result.confidence, 0.4),
        validation_passed: false,
        validation_errors: [...result.validation_errors, "Urgency intent detected but no urgency words found in text"]
      };
    }
  }
  return result;
}
