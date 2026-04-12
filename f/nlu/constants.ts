// ============================================================================
// NLU CONSTANTS — Re-exports from f/internal/ai_agent/constants.ts
// ============================================================================
// AUDITOR.md §B.7 compliance: canonical path for confidence thresholds
// and intent constants used across the NLU boundary.
// All authoritative definitions live in f/internal/ai_agent/constants.ts.
// ============================================================================

export {
  INTENT,
  CONFIDENCE_THRESHOLDS,
  CONFIDENCE_BOUNDARIES,
  INTENT_KEYWORDS,
  NORMALIZATION_MAP,
  ESCALATION_THRESHOLDS,
  RULE_CONFIDENCE_VALUES,
  SOCIAL_CONFIDENCE_VALUES,
  URGENCY_WORDS,
  GREETINGS,
  FAREWELLS,
  THANK_YOU_WORDS,
} from '../internal/ai_agent/constants';
export type { IntentType } from '../internal/ai_agent/constants';
