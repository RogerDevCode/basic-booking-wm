import asyncio
import sys
from unittest.mock import MagicMock

import pytest
import wmill

# Inject a dummy wmill module before any tests are collected
mock_wmill_module = MagicMock()
mock_wmill_module.get_variable.return_value = "val"
mock_wmill_module.get_resource.return_value = {}
mock_wmill_module.get_state.return_value = None
mock_wmill_module.run_script_by_path.return_value = {}
mock_wmill_module.run_script_by_path_async.return_value = "fake-job-id"
mock_wmill_module.get_result.return_value = {}
mock_wmill_module.get_job_status.return_value = "COMPLETED"

sys.modules["wmill"] = mock_wmill_module

# Patch asyncio.run before anything else imports it
orig_run = asyncio.run


def mock_run(coro: object) -> object:
    try:
        asyncio.get_running_loop()
        return coro
    except RuntimeError:
        return orig_run(coro)


asyncio.run = mock_run


@pytest.fixture(autouse=True)
def windmill_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WM_WORKSPACE", "test")
    monkeypatch.setenv("WM_TOKEN", "test")
    monkeypatch.setenv("WM_BASE_URL", "http://localhost:8000")


@pytest.fixture
def mock_wmill() -> MagicMock:
    return wmill
