import sys
from unittest.mock import MagicMock

# ─── WMILL RUNTIME MOCK ───
# This prevents ModuleNotFoundError: No module named 'wmill' in CI/Local Dev
# when importing scripts that use the Windmill SDK.

wmill_mock = MagicMock()
wmill_mock.get_variable.return_value = "mock_val"
wmill_mock.get_resource.return_value = {}
wmill_mock.set_resource.return_value = None
wmill_mock.get_state.return_value = None
wmill_mock.set_state.return_value = None
wmill_mock.set_progress.return_value = None
wmill_mock.cancel_running.return_value = None
wmill_mock.run_script_by_path.return_value = {}
wmill_mock.run_script_by_path_async.return_value = "fake-job-id"
wmill_mock.get_result.return_value = {}
wmill_mock.get_job_status.return_value = "COMPLETED"

# Inject into sys.modules before any project code is imported
sys.modules["wmill"] = wmill_mock
