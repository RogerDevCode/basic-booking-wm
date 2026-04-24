import pytest
from f.internal._result import ok, fail, is_ok, is_fail, wrap

def test_result_ok() -> None:
    res = ok("data")
    assert is_ok(res)
    assert not is_fail(res)
    assert res == (None, "data")

def test_result_fail() -> None:
    res = fail(ValueError("bad"))
    assert not is_ok(res)
    assert is_fail(res)
    assert isinstance(res[0], ValueError)
    assert str(res[0]) == "bad"
    assert res[1] is None

def test_result_fail_string() -> None:
    res = fail("string error")
    assert is_fail(res)
    assert isinstance(res[0], Exception)
    assert str(res[0]) == "string error"

@pytest.mark.asyncio
async def test_result_wrap_success() -> None:
    async def my_coro() -> str:
        return "success"
    res = await wrap(my_coro())
    assert is_ok(res)
    assert res[1] == "success"

@pytest.mark.asyncio
async def test_result_wrap_failure() -> None:
    async def my_coro() -> str:
        raise ValueError("async fail")
    res = await wrap(my_coro())
    assert is_fail(res)
    assert isinstance(res[0], ValueError)
    assert str(res[0]) == "async fail"

from f.internal._wmill_adapter import get_env, get_variable

def test_wmill_adapter_get_env() -> None:
    assert get_env("PATH") is not None

def test_wmill_adapter_get_variable() -> None:
    # Local fallback
    assert get_variable("PATH") is not None

