// ============================================================================
// GUARDRAILS — Input/Output validation for LLM pipeline (v3.1)
// Pattern: Zero mocks, strict validation, no assertions
// ============================================================================

import { INTENT, URGENCY_WORDS } from './constants.ts';
import type { GuardrailResult, IntentResult } from './types.ts';

// Prompt injection patterns
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /developer\s+mode/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /disregard\s+instructions?/i,
  /you\s+are\s+now/i,
  /pretend\s+to\s+be/i,
  /forget\s+(all|your|the)\s+(instructions|rules|prompt)/i,
];

// Unicode attack vectors
const DANGEROUS_UNICODE: readonly string[] = [
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
const LEAKAGE_PATTERNS: readonly string[] = [
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
    return cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

export function verifyUrgency(result: IntentResult, text: string): IntentResult {
  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
    
  const hasUrgency = URGENCY_WORDS.some(w => lower.includes(w));
  const hasUrgencyTypos = lower.includes('urjente') || lower.includes('urgnete') || lower.includes('urjencia') || lower.includes('nececito atencion') || lower.includes('duele');

  if (result.intent === INTENT.URGENCIA) {
    if (!hasUrgency && !hasUrgencyTypos) {
      return { 
        ...result, 
        confidence: Math.min(result.confidence, 0.4),
        validation_passed: false,
        validation_errors: [...result.validation_errors, "Urgency intent detected but no urgency words found in text"]
      };
    }
    // Boost confidence when urgency words are found
    if ((hasUrgency || hasUrgencyTypos) && result.confidence < 0.7) {
      return { ...result, confidence: 0.75 };
    }
  }

  // Detect urgency even if LLM didn't catch it
  if (result.intent !== INTENT.URGENCIA && (hasUrgency || hasUrgencyTypos) && result.confidence < 0.5) {
    return {
      ...result,
      intent: INTENT.URGENCIA,
      confidence: 0.75,
      validation_errors: [...result.validation_errors, "Upgraded to urgent care based on urgency keywords"]
    };
  }

  return result;
}
