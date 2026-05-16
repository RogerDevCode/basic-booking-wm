from typing import TypedDict

import jwt


class TokenPayload(TypedDict):
    sub: str
    role: str


def verify_access_token(token: str) -> TokenPayload:
    try:
        import wmill as _wmill

        secret = str(_wmill.get_variable("u/admin/ENCRYPTION_KEY"))
    except ImportError:
        import os

        secret = os.environ.get("ENCRYPTION_KEY", "")
    if not secret:
        raise RuntimeError("ENCRYPTION_KEY not configured")
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return {"sub": str(payload.get("sub")), "role": str(payload.get("role"))}
    except Exception as e:
        raise RuntimeError(f"Invalid or expired token: {e}") from e
