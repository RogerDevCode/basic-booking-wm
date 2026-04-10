# Problem
In `llm` mode, `main.ts` bypasses the TF-IDF / `detectIntentRules` certainty. If `!skipLLM` is true, Groq is always called, overwriting the `tfidfResult` intent.
Because Groq is probabilistic, it hallucinates or misclassifies simple inputs like "Quiero agendar", making 13 reliable golden tests fail.
Also, `calibrateConfidence` incorrectly penalizes 1-word greetings ("Hola"), reducing confidence to 0.855, failing the 0.9 threshold.

# Fix Overview
1. Update `calibrateConfidence` to NOT penalize `GREETING`, `FAREWELL`, `THANK_YOU`, `SHOW_MAIN_MENU`, `WIZARD_STEP` since these are naturally short.
2. In `main()`, introduce `isDeterministicHighConfidence`:
   If `detectIntentRules` yields `confidence >= 0.75` OR `tfidfResult.confidence >= 0.7`, we skip the LLM.
   Only route to LLM if both deterministic algorithms yield low confidence or `UNKNOWN`.
