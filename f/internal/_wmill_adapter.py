from __future__ import annotations

import logging

try:
    from typing import TypeIs
except ImportError:
    from typing import TypeIs

try:
    import wmill
except ImportError:
    # ─── WMILL FALLBACK MOCK ───
    # This allows the code to be imported in CI/Local Dev environments
    # where the Windmill SDK is not present.
    from unittest.mock import MagicMock

    wmill = MagicMock()


def is_dict_str_obj(val: object) -> TypeIs[dict[str, object]]:
    return isinstance(val, dict) and all(isinstance(k, str) for k in val.keys())


def get_variable(path: str) -> str | None:
    """Wrapper for backward compatibility, returns None on failure."""
    try:
        val = wmill.get_variable(path)
        if val is None:
            return None
        return str(val)
    except Exception:
        return None


def get_resource(path: str) -> dict[str, object] | None:
    """Fetch a Windmill resource and validate it is a dict[str, object]."""
    try:
        raw: object = wmill.get_resource(path)
        if not is_dict_str_obj(raw):
            return None
        return raw
    except Exception:
        return None


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


_logger: logging.Logger | None = None


def _init_logging() -> logging.Logger:
    global _logger
    if _logger is not None:
        return _logger
    logger = logging.getLogger("booking_titanium")
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    _logger = logger
    return logger


def log(message: str, **kwargs: object) -> None:
    try:
        logger = _init_logging()
        level = logging.INFO
        msg_upper = message.upper()
        if "ERROR" in msg_upper or "CATASTROPHE" in msg_upper or "FAIL" in msg_upper:
            level = logging.ERROR
        elif "WARN" in msg_upper:
            level = logging.WARNING

        ctx = " | ".join(f"{k}={v}" for k, v in kwargs.items())
        final_msg = f"{message} | {ctx}" if kwargs else message
        logger.log(level, final_msg)
    except Exception:
        pass
