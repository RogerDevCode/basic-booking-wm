from __future__ import annotations
from typing import Any, Dict, Optional, TypeVar, TypeIs, cast
import wmill
from returns.result import Result, Success, Failure

T = TypeVar("T")

def is_dict_str_any(val: object) -> TypeIs[Dict[str, object]]:
    return isinstance(val, dict) and all(isinstance(k, str) for k in val.keys())

def get_variable_safe(path: str) -> Result[str, Exception]:
    try:
        val = wmill.get_variable(path)
        return Success(str(val))
    except Exception as e:
        return Failure(e)

def get_resource_safe(path: str, schema: type[T]) -> Result[T, Exception]:
    try:
        raw: object = wmill.get_resource(path)
        if not is_dict_str_any(raw):
            return Failure(TypeError(f"Resource at {path} is not a valid dictionary"))
        
        # Boundary validation via cast + TypeGuard (simplified for brevity, 
        # normally you'd use Pydantic here)
        return Success(cast(T, raw))
    except Exception as e:
        return Failure(e)

def log(message: str, **kwargs: object) -> None:
    try:
        # Internal non-leaking log
        print(f"WMILL_LOG: {message} | {kwargs}")
    except Exception:
        pass
