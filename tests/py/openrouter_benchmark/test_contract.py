from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from f.openrouter_benchmark.main import main


@pytest.mark.asyncio
async def test_openrouter_benchmark_success() -> None:
    # Mock return for a single task
    mock_res = {
        "model": "Gemini",
        "taskId": "t1",
        "success": True,
        "rawResponse": "{}",
        "parsed": None,
        "error": None,
        "correct": True,
        "latencyMs": 100,
        "totalTokens": 50,
    }

    with (
        patch("f.openrouter_benchmark.main.get_variable", return_value="fake-key"),
        patch("f.openrouter_benchmark.main.run_benchmark_task", AsyncMock(return_value=(None, mock_res))),
    ):
        # Limit models and tasks for test speed if possible,
        # but here we test the orchestration of the list

        # Inject small lists for testing
        with (
            patch("f.openrouter_benchmark.main.MODELS", [{"id": "m1", "name": "M1"}]),
            patch(
                "f.openrouter_benchmark.main.TASKS",
                [{"name": "t1", "userMessage": "hi", "expectedIntent": "i", "expectedHuman": False}],
            ),
        ):
            err, result = main({})

            assert err is None
            assert result is not None
            assert result["modelsTested"] == 1
            assert result["summaries"][0]["correct"] == 1
