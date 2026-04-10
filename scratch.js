const { INTENT, INTENT_KEYWORDS } = require('./out/f/internal/ai_agent/constants.js');
const lower = "hola";
const hasActionableKeywords =
    INTENT_KEYWORDS[INTENT.CANCEL_APPOINTMENT]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.RESCHEDULE]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.CHECK_AVAILABILITY]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.CREATE_APPOINTMENT]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.GET_MY_BOOKINGS]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.ACTIVATE_REMINDERS]?.keywords.some(k => lower.includes(k)) ||
    INTENT_KEYWORDS[INTENT.DEACTIVATE_REMINDERS]?.keywords.some(k => lower.includes(k));

console.log('hasActionableKeywords:', hasActionableKeywords);
let matching = [];
Object.entries(INTENT_KEYWORDS).forEach(([intent, data]) => {
  data.keywords.forEach(k => {
    if (lower.includes(k)) matching.push({intent, k});
  })
});
console.log('Matching keywords:', matching);
