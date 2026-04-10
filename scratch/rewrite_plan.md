# Simple, Robust LLM Bypass
1. Get TF-IDF Result.
2. Get Rules Result.
3. If Rules Result > 0.3 -> We have a valid rule match! Use it. Bypass LLM.
4. Else if TF-IDF > 0.4 -> We have a semantic match! Use it. Bypass LLM.
5. Else -> We don't know what this is. Call the LLM.
