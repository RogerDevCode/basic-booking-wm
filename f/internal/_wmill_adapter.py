# mypy: disable-error-code="misc, unused-ignore, import-not-found, import-untyped"
import os
from typing import cast

# Encapsulates Windmill SDK to prevent direct dependencies in business logic

def get_variable(path: str) -> str | None:
    """Gets a Windmill variable or fallback to env for local dev."""
    try:
        import wmill # type: ignore[import-not-found]
        # cast to object to avoid Any propagation
        val = cast(object, wmill.get_variable(path)) # pyright: ignore[reportUnknownMemberType]
        if val is not None:
            return str(val)
    except ImportError:
        pass
    
    # Fallback for local development
    env_name = path.split("/")[-1] if "/" in path else path
    return os.getenv(env_name)

def get_env(key: str) -> str | None:
    """Gets an environment variable safely."""
    return os.getenv(key)

def log(message: str, **kwargs: object) -> None:
    """Structured logging compatible with Windmill."""
    try:
        import wmill # type: ignore[import-not-found]
        if hasattr(wmill, "log"):
            log_fn = cast(object, getattr(wmill, "log"))
            if callable(log_fn):
                log_fn(message, **kwargs)
            return
    except ImportError:
        pass
    
    # Fallback stdout
    print(f"[LOG] {message} {kwargs if kwargs else ''}")

def run_script(path: str, args: dict[str, object]) -> tuple[str | None, object | None]:
    """Runs a Windmill script and returns its Result tuple."""
    try:
        import wmill # type: ignore[import-not-found]
        # cast to object to avoid Any propagation
        result = cast(object, wmill.run_script(path=path, args=args)) # pyright: ignore[reportUnknownMemberType]
        if isinstance(result, (list, tuple)) and len(result) == 2:
            return cast(str | None, result[0]), result[1]
        return None, result
    except ImportError:
        return f"Windmill environment not available (local mock for {path})", None
