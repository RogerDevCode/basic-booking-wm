import json
import time
from typing import Any, Dict, Optional, Tuple, Literal
from .._wmill_adapter import log
from ._constants import INTENT, ESCALATION_THRESHOLDS
from ._ai_agent_models import AIAgentInput, IntentResult, LLMOutput
from ._prompt_builder import build_system_prompt, build_user_message
from ._llm_client import call_llm, LLMResponse
from ._tfidf_classifier import classify_intent
from ._rag_context import build_rag_context
from ._guardrails import validate_input, verify_urgency, sanitize_json_response
from ._ai_agent_logic import (
    detect_social, adjust_intent_with_context, extract_entities, 
    detect_context, determine_escalation_level, generate_ai_response
)

MODULE = "ai_agent"

async def main(args: dict[str, Any]) -> Dict[str, Any]:
    start_ms = int(time.time() * 1000)
    
    # 0. Validate Input
    try:
        input_data = AIAgentInput.model_validate(args)
    except Exception as e:
        return {"success": False, "data": None, "error_code": "VALIDATION_ERROR", "error_message": str(e)}

    text = input_data.text

    # 1. Guardrails
    guard = validate_input(text)
    if guard["kind"] == "blocked":
        return {"success": False, "data": None, "error_code": "GUARDRAIL_BLOCKED", "error_message": guard["reason"]}

    # 2. Intent Detection
    intent = INTENT['DESCONOCIDO']
    confidence = 0.0
    provider: Literal["groq", "openai", "openrouter", "fallback", "fast-path"] = "fallback"
    cot_reasoning = "Fallback to rules-based detection"

    # 2.1 Social Fast-Path
    social = detect_social(text)
    if social:
        intent, confidence = social
        provider = "fast-path"
        cot_reasoning = "Social fast-path matched"
    else:
        # 2.2 TF-IDF
        tfidf = classify_intent(text)
        has_enough = len(text.split()) >= 2
        if tfidf["confidence"] >= ESCALATION_THRESHOLDS['tfidf_minimum'] and has_enough:
            intent = tfidf["intent"]
            confidence = tfidf["confidence"]
            cot_reasoning = f"TF-IDF semantic match ({intent})"

        # 2.3 LLM Path (if enabled)
        rag_context = None
        if intent in [INTENT['PREGUNTA_GENERAL'], INTENT['DESCONOCIDO']]:
            rag_res = await build_rag_context(input_data.provider_id, text)
            rag_context = rag_res["context"]

        sys_prompt = build_system_prompt(rag_context)
        user_msg = build_user_message(text)
        
        err_llm, llm_res = await call_llm(sys_prompt, user_msg)
        if not err_llm and llm_res:
            try:
                cleaned = sanitize_json_response(llm_res.content)
                raw_json = json.loads(cleaned)
                llm_out = LLMOutput.model_validate(raw_json)
                intent = llm_out.intent
                confidence = llm_out.confidence
                provider = llm_res.provider
                cot_reasoning = "LLM classification"
            except Exception as e:
                log("LLM response parse failed", error=str(e), content=llm_res.content)
        
    # 2.5 Context Adjustment
    adj = adjust_intent_with_context(text, intent, confidence, input_data.conversation_state)
    if adj["adjusted"]:
        intent = adj["intent"]
        confidence = adj["confidence"]
        cot_reasoning = adj["reason"]

    # 3. Entities & Context Logic
    entities = extract_entities(text)
    ctx = detect_context(text, entities)
    
    ai_resp, needs_more, follow_up = generate_ai_response(
        intent, entities, ctx, input_data.user_profile
    )
    
    esc_level = determine_escalation_level(intent, text, confidence)

    result = IntentResult(
        intent=intent,
        confidence=confidence,
        entities=entities,
        context=ctx,
        subtype=None,
        ai_response=ai_resp,
        needs_more_info=needs_more,
        follow_up=follow_up,
        requires_human=(esc_level != "none"),
        escalation_level=esc_level,
        cot_reasoning=cot_reasoning,
        validation_passed=True
    )

    verified = verify_urgency(result, text)

    # Log/Trace performance (simplified)
    log("AI Agent execution complete", 
        intent=verified.intent, 
        confidence=verified.confidence, 
        provider=provider,
        latency_ms=int(time.time() * 1000) - start_ms
    )

    return {"success": True, "data": verified.model_dump(), "error_message": None}
