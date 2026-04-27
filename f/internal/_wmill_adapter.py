from __future__ import annotations

from typing import TypeIs, TypeVar, cast

try:
    import wmill
except ImportError:
    # ─── WMILL FALLBACK MOCK ───
    # This allows the code to be imported in CI/Local Dev environments
    # where the Windmill SDK is not present.
    from unittest.mock import MagicMock

    wmill = MagicMock()

from returns.result import Failure, Result, Success

T = TypeVar("T")


def is_dict_str_obj(val: object) -> TypeIs[dict[str, object]]:
    return isinstance(val, dict) and all(isinstance(k, str) for k in val.keys())


def get_variable_safe(path: str) -> Result[str, Exception]:
    try:
        val = wmill.get_variable(path)
        return Success(str(val))
    except Exception as e:
        return Failure(e)


def get_variable(path: str) -> str | None:
    """Wrapper for backward compatibility, returns None on failure."""
    res = get_variable_safe(path)
    match res:
        case Success(val):
            return str(val)
        case Failure(_):
            return None
    return None


def get_resource_safe[T](path: str, schema: type[T]) -> Result[T, Exception]:
    try:
        raw: object = wmill.get_resource(path)
        if not is_dict_str_obj(raw):
            return Failure(TypeError(f"Resource at {path} is not a valid dictionary"))

        return Success(cast("T", raw))
    except Exception as e:
        return Failure(e)


def run_script(path: str, args: dict[str, object] | None = None) -> tuple[Exception | None, object]:
    """
    Wrapper around wmill.run_script_by_path to capture exceptions
    and return them in a Result tuple.
    """
    try:
        res = wmill.run_script_by_path(path, args or {})
        return None, res
    except Exception as e:
        return e, None


def log(message: str, **kwargs: object) -> None:
    try:
        # Internal non-leaking log
        print(f"WMILL_LOG: {message} | {kwargs}")
    except Exception:
        pass
