"""RPM Benchmark: Gemini 2.5 Flash vs Gemini 3.5 Flash.

Mide la capacidad real de requests-per-minute de cada modelo
via Google AI Studio (GOOGLE_API_KEY directa).

Modelos probados:
  - gemini-2.5-flash  (GA, Jun 2025)
  - gemini-3.5-flash  (GA, May 2026)

Uso:
    GOOGLE_API_KEY=xxx uv run pytest tests/test_gemini_rpm_benchmark.py -v -s
    GOOGLE_API_KEY=xxx uv run pytest tests/test_gemini_rpm_benchmark.py -v -s --rpm-target=10
    GOOGLE_API_KEY=xxx uv run pytest tests/test_gemini_rpm_benchmark.py::test_gemini_rpm_comparison -v -s --rpm-target=5
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Final, TypedDict

import pytest

try:
    import httpx
except ImportError:
    pytest.skip("httpx not installed", allow_module_level=True)

# ============================================================================
# CONFIG
# ============================================================================

_MODELS: Final[list[str]] = [
    "gemini-2.5-flash",
    "gemini-3.5-flash",
]

_PROMPT: Final[str] = "Reply with exactly: OK"

_DEFAULT_RPM_TARGET: Final[int] = 10


class ResultEntry(TypedDict):
    request_id: int
    latency_ms: float
    status: str  # "ok" | "429" | "error"
    error: str | None


class ModelResult(TypedDict):
    model: str
    total_sent: int
    total_ok: int
    total_429: int
    total_error: int
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    max_latency_ms: float
    entries: list[ResultEntry]


# ============================================================================
# HTTP CALL
# ============================================================================

_API_URL: Final[str] = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


async def _call_model(model: str, api_key: str, request_id: int) -> ResultEntry:
    start = time.monotonic()
    url = _API_URL.format(model=model)
    params = {"key": api_key}
    payload = {
        "contents": [{"role": "user", "parts": [{"text": _PROMPT}]}],
        "generationConfig": {"maxOutputTokens": 10, "temperature": 0},
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, params=params, json=payload)
        latency = (time.monotonic() - start) * 1000

        if resp.status_code == 200:
            return ResultEntry(
                request_id=request_id,
                latency_ms=round(latency, 1),
                status="ok",
                error=None,
            )
        if resp.status_code == 429:
            return ResultEntry(
                request_id=request_id,
                latency_ms=round(latency, 1),
                status="429",
                error=resp.text[:120],
            )
        return ResultEntry(
            request_id=request_id,
            latency_ms=round(latency, 1),
            status="error",
            error=f"HTTP {resp.status_code}: {resp.text[:120]}",
        )
    except Exception as e:
        latency = (time.monotonic() - start) * 1000
        return ResultEntry(
            request_id=request_id,
            latency_ms=round(latency, 1),
            status="error",
            error=str(e)[:120],
        )


# ============================================================================
# BENCHMARK RUNNER
# ============================================================================


async def _run_benchmark(model: str, api_key: str, rpm_target: int) -> ModelResult:
    """Send rpm_target requests concurrently and measure results."""
    tasks = [asyncio.create_task(_call_model(model, api_key, i)) for i in range(rpm_target)]
    entries: list[ResultEntry] = await asyncio.gather(*tasks)

    ok_entries = [e for e in entries if e["status"] == "ok"]
    latencies = [e["latency_ms"] for e in ok_entries] if ok_entries else [0.0]
    latencies_sorted = sorted(latencies)

    def _percentile(data: list[float], pct: float) -> float:
        if not data:
            return 0.0
        idx = int(len(data) * pct / 100)
        return data[min(idx, len(data) - 1)]

    return ModelResult(
        model=model,
        total_sent=len(entries),
        total_ok=sum(1 for e in entries if e["status"] == "ok"),
        total_429=sum(1 for e in entries if e["status"] == "429"),
        total_error=sum(1 for e in entries if e["status"] == "error"),
        avg_latency_ms=round(sum(latencies) / len(latencies), 1),
        p50_latency_ms=round(_percentile(latencies_sorted, 50), 1),
        p95_latency_ms=round(_percentile(latencies_sorted, 95), 1),
        p99_latency_ms=round(_percentile(latencies_sorted, 99), 1),
        max_latency_ms=round(max(latencies), 1),
        entries=entries,
    )


def _print_report(result: ModelResult) -> None:
    sep = "=" * 70
    print(f"\n{sep}")
    print(f"MODEL: {result['model']}")
    print(f"{sep}")
    print(f"  Requests sent : {result['total_sent']}")
    print(f"  OK (200)      : {result['total_ok']}")
    print(f"  Rate limited  : {result['total_429']}")
    print(f"  Errors        : {result['total_error']}")
    print(f"  Success rate  : {result['total_ok'] / result['total_sent'] * 100:.0f}%")
    print(f"  Avg latency   : {result['avg_latency_ms']}ms")
    print(f"  P50 latency   : {result['p50_latency_ms']}ms")
    print(f"  P95 latency   : {result['p95_latency_ms']}ms")
    print(f"  P99 latency   : {result['p99_latency_ms']}ms")
    print(f"  Max latency   : {result['max_latency_ms']}ms")
    print(f"{sep}")


# ============================================================================
# PYTEST
# ============================================================================


def _get_api_key() -> str:
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        pytest.skip("GOOGLE_API_KEY not set")
    try:
        import httpx

        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        resp = httpx.post(
            url,
            params={"key": key},
            json={
                "contents": [{"role": "user", "parts": [{"text": "ping"}]}],
                "generationConfig": {"maxOutputTokens": 2, "temperature": 0},
            },
            timeout=5.0,
        )
        if resp.status_code == 429:
            pytest.skip("Google AI Studio rate limited (429)")
        elif resp.status_code != 200:
            pytest.skip(f"Google AI Studio API error ({resp.status_code}): {resp.text}")
    except Exception as e:
        pytest.skip(f"Google AI Studio connection failed: {e}")
    return key


@pytest.mark.parametrize("model", _MODELS)
@pytest.mark.asyncio
async def test_gemini_rpm_benchmark(model: str, request: pytest.FixtureRequest) -> None:
    """Benchmark RPM capacity for a Gemini model.

    Sends --rpm-target concurrent requests and measures success rate + latency.
    """
    api_key = _get_api_key()
    rpm_target = request.config.getoption("--rpm-target", default=_DEFAULT_RPM_TARGET)
    rpm_target = int(rpm_target or _DEFAULT_RPM_TARGET)

    print(f"\n[Benchmark] {model} — {rpm_target} concurrent requests")

    result = await _run_benchmark(model, api_key, rpm_target)
    _print_report(result)

    # At least 50% should succeed at the default RPM target
    assert result["total_ok"] >= rpm_target * 0.5, (
        f"{model}: only {result['total_ok']}/{rpm_target} succeeded. "
        f"429s={result['total_429']}, errors={result['total_error']}"
    )


@pytest.mark.asyncio
async def test_gemini_rpm_comparison(request: pytest.FixtureRequest) -> None:
    """Compare all models side-by-side at the same RPM target."""
    api_key = _get_api_key()
    rpm_target = request.config.getoption("--rpm-target", default=_DEFAULT_RPM_TARGET)
    rpm_target = int(rpm_target or _DEFAULT_RPM_TARGET)

    print(f"\n[Comparison] All models at {rpm_target} RPM concurrent burst")

    results: list[ModelResult] = []
    for model in _MODELS:
        result = await _run_benchmark(model, api_key, rpm_target)
        results.append(result)
        _print_report(result)

    # Print comparison table
    sep = "=" * 90
    print(f"\n{sep}")
    print(f"{'Model':<25} {'OK':>5} {'429':>5} {'Err':>5} {'%OK':>5} {'Avg':>8} {'P50':>8} {'P95':>8}")
    print(sep)
    for r in results:
        print(
            f"{r['model']:<25} {r['total_ok']:>5} {r['total_429']:>5} "
            f"{r['total_error']:>5} {r['total_ok'] / r['total_sent'] * 100:>4.0f}% "
            f"{r['avg_latency_ms']:>6}ms {r['p50_latency_ms']:>6}ms {r['p95_latency_ms']:>6}ms"
        )
    print(sep)
