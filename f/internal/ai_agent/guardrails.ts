// ============================================================================
// GUARDRAILS — Input/Output validation for LLM pipeline
// ============================================================================

import { INTENT, URGENCY_WORDS } from './constants';

// Prompt injection patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /developer\s+mode/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /disregard\s+instructions?/i,
  /you\s+are\s+now/i,
  /pretend\s+to\s+be/i,
  /forget\s+(all|your|the)\s+(instructions|rules|prompt)/i,
];

// Unicode attack vectors
const DANGEROUS_UNICODE = [
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
const LEAKAGE_PATTERNS = [
  'SYSTEM_INSTRUCTIONS',
  'UNTRUSTED INPUT',
  'BEGIN USER DATA',
  'END USER DATA',
  'INTENT DEFINITIONS',
  'REGLAS DE DESEMPATE',
];

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateInput(text: string): ValidationResult {
  if (!text || text.trim().length === 0) {
    return { valid: false, reason: 'Empty input' };
  }
  if (text.length > 500) {
    return { valid: false, reason: 'Input too long (max 500 chars)' };
  }

  // Check for prompt injection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { valid: false, reason: 'Potential prompt injection detected' };
    }
  }

  // Check for dangerous unicode
  for (const char of DANGEROUS_UNICODE) {
    if (text.includes(char)) {
      return { valid: false, reason: 'Dangerous unicode character detected' };
    }
  }

  return { valid: true };
}

export function validateOutput(content: string): ValidationResult {
  if (!content || content.trim().length === 0) {
    return { valid: false, reason: 'Empty LLM response' };
  }
  if (content.length > 2000) {
    return { valid: false, reason: 'LLM response too long' };
  }

  // Check for system prompt leakage
  for (const pattern of LEAKAGE_PATTERNS) {
    if (content.includes(pattern)) {
      return { valid: false, reason: 'System prompt leakage detected' };
    }
  }

  return { valid: true };
}

export function sanitizeJSONResponse(raw: string): string {
  let cleaned = raw.trim();

  // Remove markdown code blocks
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Remove any preamble before first {
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace > 0) {
    cleaned = cleaned.substring(firstBrace);
  }

  // Remove any trailing text after last }
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace >= 0 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.substring(0, lastBrace + 1);
  }

  return cleaned;
}

export interface ParsedIntentResult {
  intent: typeof INTENT[keyof typeof INTENT];
  confidence: number;
  entities: Record<string, unknown>;
  needs_more: boolean;
  follow_up: string | null;
}

export function parseAndValidateLLMResult(raw: string): ParsedIntentResult | null {
  const cleaned = sanitizeJSONResponse(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate intent
  const intent = obj['intent'];
  if (typeof intent !== 'string') {
    return null;
  }
  const validIntents = Object.values(INTENT) as string[];
  if (!validIntents.includes(intent)) {
    return null;
  }

  // Validate confidence
  const confidence = typeof obj['confidence'] === 'number' ? obj['confidence'] : 0.5;
  const clampedConfidence = Math.max(0.0, Math.min(1.0, confidence));

  // Validate entities
  const entities = typeof obj['entities'] === 'object' && obj['entities'] !== null
    ? obj['entities'] as Record<string, unknown>
    : {};

  // Validate needs_more
  const needs_more = typeof obj['needs_more'] === 'boolean' ? obj['needs_more'] : false;

  // Validate follow_up
  const follow_up = typeof obj['follow_up'] === 'string'
    ? obj['follow_up'].substring(0, 200)
    : null;

  return {
    intent: intent as typeof INTENT[keyof typeof INTENT],
    confidence: clampedConfidence,
    entities,
    needs_more,
    follow_up,
  };
}

export function crossCheckUrgency(result: ParsedIntentResult, text: string): ParsedIntentResult {
  // If LLM says urgent_care but no urgency words found, lower confidence
  if (result.intent === INTENT.URGENT_CARE) {
    const lower = text.toLowerCase();
    const hasUrgency = URGENCY_WORDS.some(w => lower.includes(w));
    if (!hasUrgency) {
      return { ...result, confidence: Math.min(result.confidence, 0.5) };
    }
  }

  // If there ARE urgency words but LLM didn't detect urgent_care, it might be wrong
  // but we don't override — just log (handled in main)
  return result;
}
