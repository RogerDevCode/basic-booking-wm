from typing import TypeVar, Awaitable
try:
    from typing import TypeGuard
except ImportError:
    # Fallback if typing_extensions is needed or not available, but Python 3.10+ has it in typing.
    # Windmill uses Python 3.11+
    from typing import TypeGuard

T = TypeVar("T")
# Result is a strict tuple: [Error | None, T | None]
Result = tuple[Exception | None, T | None]

def ok(data: T) -> tuple[None, T]:
    """Creates a successful result tuple."""
    return (None, data)

def fail(error: Exception | str) -> tuple[Exception, None]:
    """Creates a failed result tuple, ensuring the error is an Exception object."""
    err = error if isinstance(error, Exception) else Exception(str(error))
    return (err, None)

def is_ok(result: Result[T]) -> TypeGuard[tuple[None, T]]:
    """Type guard to check if a result is successful."""
    return result[0] is None

def is_fail(result: Result[T]) -> TypeGuard[tuple[Exception, None]]:
    """Type guard to check if a result failed."""
    return result[0] is not None

async def wrap(coro: Awaitable[T]) -> Result[T]:
    """Wraps an awaitable to return a Result tuple instead of raising an exception."""
    try:
        data = await coro
        return ok(data)
    except Exception as e:
        return fail(e)

from typing import Protocol, Callable
import re

class DBClient(Protocol):
    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]: ...
    async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None: ...
    async def fetchval(self, query: str, *args: object) -> object | None: ...
    async def execute(self, query: str, *args: object) -> str: ...

async def with_tenant_context(
    client: DBClient,
    tenant_id: str,
    operation: Callable[[], Awaitable[Result[T]]]
) -> Result[T]:
    uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
    if not uuid_re.match(tenant_id):
        return fail(f'invalid_tenant_id: "{tenant_id}"')
    
    try:
        await client.execute('BEGIN')
        await client.execute("SELECT set_config('app.current_tenant', $1, true)", tenant_id)
        
        err, result = await operation()
        
        if err is not None:
            await client.execute('ROLLBACK')
            return fail(err)
            
        await client.execute('COMMIT')
        if result is None:
            # Type guard for success returning None vs actual generic typing
            return ok(None) # type: ignore[arg-type]
        return ok(result)
        
    except Exception as error:
        try:
            await client.execute('ROLLBACK')
        except Exception as e:
            from ..internal._wmill_adapter import log
            log("SILENT_ERROR_CAUGHT", error=str(e), file="_result.py")
            pass
        return fail(f"transaction_failed: {str(error)}")

async def with_admin_context(
    client: DBClient,
    operation: Callable[[], Awaitable[Result[T]]]
) -> Result[T]:
    """Executes DB logic with app.admin_override = 'true' to bypass RLS."""
    try:
        await client.execute('BEGIN')
        await client.execute("SELECT set_config('app.admin_override', 'true', true)")
        
        err, result = await operation()
        
        if err is not None:
            await client.execute('ROLLBACK')
            return fail(err)
            
        await client.execute('COMMIT')
        if result is None:
            return ok(None) # type: ignore[arg-type]
        return ok(result)
        
    except Exception as error:
        try:
            await client.execute('ROLLBACK')
        except Exception as e:
            from ..internal._wmill_adapter import log
            log("SILENT_ERROR_CAUGHT", error=str(e), file="_result.py")
            pass
        return fail(f"transaction_failed: {str(error)}")
