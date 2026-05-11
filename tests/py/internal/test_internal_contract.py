from f.internal._config import get_env
from f.internal._wmill_adapter import get_variable


def test_wmill_adapter_get_env() -> None:
    assert get_env("PATH") is not None


def test_wmill_adapter_get_variable() -> None:
    # Local fallback
    assert get_variable("PATH") is not None
