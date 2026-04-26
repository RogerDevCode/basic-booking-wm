# mypy: disable-error-code="import-not-found, import-untyped, misc, no-any-return"
"""Windmill SDK adapter - encapsulates untyped external library."""
from __future__ import annotations

import os
import traceback
from typing import Any, cast

# Encapsulates Windmill SDK to prevent direct dependencies in business logic


def get_variable(path: str) -> str | None:
    """Gets a Windmill variable or fallback to env for local dev."""
    try:
        import wmill

        val: object = wmill.get_variable(path)
        if val is not None and str(val).strip():
            return str(val)
    except Exception as e:
        log("get_variable failed", path=path, error=str(e))

    env_name = path.split("/")[-1] if "/" in path else path
    return os.getenv(env_name)


def get_env(key: str) -> str | None:
    """Gets an environment variable safely."""
    return os.getenv(key)


def log(message: str, **kwargs: object) -> None:
    """Structured logging compatible with Windmill."""
    if "error" in kwargs and "traceback" not in kwargs:
        kwargs["traceback"] = traceback.format_exc()

    try:
        import wmill

        if hasattr(wmill, "log"):
            log_fn: Any = getattr(wmill, "log")
            if callable(log_fn):
                log_fn(message, **kwargs)
            return
    except (ImportError, Exception):
        pass

    print(f"[LOG] {message} {kwargs if kwargs else ''}")


def run_script(path: str, args: dict[str, object]) -> tuple[str | None, object | None]:
    """Runs a Windmill script and returns its Result tuple."""
    try:
        import wmill

        result: object = wmill.run_script(path=path, args=args)
        if isinstance(result, (list, tuple)) and len(result) == 2:
            return cast("str | None", result[0]), result[1]
        return None, result
    except Exception as e:
        log("run_script failed", path=path, error=str(e))
        return f"Windmill script execution failed: {str(e)}", None
