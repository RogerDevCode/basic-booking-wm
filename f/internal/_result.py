from __future__ import annotations

import re
from typing import (
    TYPE_CHECKING,
    Protocol,
    TypeIs,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

# PEP 695 Type Alias
type Result[T] = tuple[Exception | None, T | None]


def ok[T](data: T) -> tuple[None, T]:
    """Creates a successful result tuple."""
    return (None, data)


def fail(error: Exception | str | None) -> tuple[Exception, None]:
    """Creates a failed result tuple, ensuring the error is an Exception object."""
    if error is None:
        err = Exception("unknown_error")
    elif isinstance(error, Exception):
        err = error
    else:
        err = Exception(str(error))
    return (err, None)


def is_ok_outcome[T](result: Result[T]) -> TypeIs[tuple[None, T]]:
    """Type narrowing to check if a result is successful."""
    return result[0] is None


def is_fail_outcome[T](result: Result[T]) -> TypeIs[tuple[Exception, None]]:
    """Type narrowing to check if a result failed."""
    return result[0] is not None


async def wrap[T](coro: Awaitable[T]) -> Result[T]:
    """Wraps an awaitable to return a Result tuple instead of raising an exception."""
    try:
        data = await coro
        return ok(data)
    except Exception as e:
        return fail(e)


class DBClient(Protocol):
    """Protocol for database client operations."""

    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]: ...

    async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None: ...

    async def fetchval(self, query: str, *args: object) -> object | None: ...

    async def execute(self, query: str, *args: object) -> str: ...

    async def close(self) -> None: ...


async def with_tenant_context[T](
    client: DBClient, tenant_id: str, operation: Callable[[], Awaitable[Result[T]]]
) -> Result[T]:
    """Executes DB logic within a tenant context."""
    uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
    if not uuid_re.match(tenant_id):
        return fail(f'invalid_tenant_id: "{tenant_id}"')

    try:
        await client.execute("BEGIN")
        await client.execute("SELECT set_config('app.current_tenant', $1, true)", tenant_id)

        res = await operation()

        if is_ok_outcome(res):
            await client.execute("COMMIT")
            return ok(res[1])

        await client.execute("ROLLBACK")
        # Since is_ok_outcome failed, and it's a tuple of (Exception | None, T | None)
        # we can check is_fail_outcome
        if is_fail_outcome(res):
            return fail(res[0])

        return fail("unknown_transaction_failure")

    except Exception as error:
        try:
            await client.execute("ROLLBACK")
        except Exception as e:
            from ._wmill_adapter import log

            log("SILENT_ERROR_CAUGHT", error=str(e), file="_result.py")
        return fail(f"transaction_failed: {error!s}")


async def with_admin_context[T](client: DBClient, operation: Callable[[], Awaitable[Result[T]]]) -> Result[T]:
    """Executes DB logic with app.admin_override = 'true' to bypass RLS."""
    try:
        await client.execute("BEGIN")
        await client.execute("SELECT set_config('app.admin_override', 'true', true)")

        res = await operation()

        if is_ok_outcome(res):
            await client.execute("COMMIT")
            return ok(res[1])

        await client.execute("ROLLBACK")
        if is_fail_outcome(res):
            return fail(res[0])

        return fail("unknown_admin_transaction_failure")

    except Exception as error:
        try:
            await client.execute("ROLLBACK")
        except Exception as e:
            from ._wmill_adapter import log

            log("SILENT_ERROR_CAUGHT", error=str(e), file="_result.py")
        return fail(f"transaction_failed: {error!s}")
