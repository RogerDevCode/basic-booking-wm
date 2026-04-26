# mypy: disable-error-code
import asyncio
# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Benchmark OpenRouter free models for NLU classification
# DB Tables Used  : NONE
# Concurrency Risk: NO — sequential calls
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : NO
# Pydantic Schemas: YES — OpenRouterResponse validation
# ============================================================================

import os
from datetime import datetime
from typing import Any, Dict, List
from ..internal._wmill_adapter import log, get_variable
from ..internal._result import Result, ok, fail
from ._benchmark_models import BenchmarkReport, ModelSummary, ModelTestResult
from ._benchmark_logic import MODELS, TASKS, run_benchmark_task

MODULE = "openrouter_benchmark"

async def _main_async(args: dict[str, Any] = {}) -> Result[BenchmarkReport]:
    api_key = get_variable("OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return fail("OPENROUTER_API_KEY not configured")

    summaries: List[ModelSummary] = []

    for model in MODELS:
        results: List[ModelTestResult] = []
        
        for task in TASKS:
            err, res = await run_benchmark_task(api_key, model, task)
            if not err and res:
                results.append(res)
            else:
                log(f"Benchmark task {task['name']} failed for model {model['name']}", 
                    error=str(err), module=MODULE)

        passed = len([r for r in results if r["success"]])
        failed = len(results) - passed
        correct = len([r for r in results if r["correct"]])
        avg_latency = int(sum(r["latencyMs"] for r in results) / len(results)) if results else 0

        summaries.append({
            "model": model["name"],
            "totalTasks": len(results),
            "passed": passed,
            "failed": failed,
            "correct": correct,
            "avgLatencyMs": avg_latency,
            "results": results
        })

    report: BenchmarkReport = {
        "timestamp": datetime.now().isoformat(),
        "modelsTested": len(summaries),
        "summaries": summaries
    }

    return ok(report)


def main(args: dict) -> None:
    import traceback
    try:
        return asyncio.run(_main_async(args))
    except Exception as e:
        tb = traceback.format_exc()
        # Intentamos usar el adaptador local si está disponible, si no print
        try:
            from ..internal._wmill_adapter import log
            log("CRITICAL_ENTRYPOINT_ERROR", error=str(e), traceback=tb, module=os.path.basename(os.path.dirname(__file__)))
        except:
            from ..internal._wmill_adapter import log
            log("BARE_EXCEPT_CAUGHT", file="main.py")
            print(f"CRITICAL ERROR in {__file__}: {e}\n{tb}")
        
        # Elevamos para que Windmill marque como FAILED
        raise RuntimeError(f"Execution failed: {e}")
