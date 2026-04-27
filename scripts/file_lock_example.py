#!/usr/bin/env python3
"""
Example: Using exclusive file locks in Windmill scripts

Usage in any f/*/main.py:
    from ..internal._file_lock import exclusive_file_lock

    async def _main_async(args: dict[str, Any]) -> Result[T]:
        # Lock a critical section that reads/modifies files
        with exclusive_file_lock("/tmp/shared_state.json"):
            # Read file
            with open("/tmp/shared_state.json", "r") as f:
                state = json.load(f)

            # Modify
            state["counter"] += 1

            # Write back (atomic from lock perspective)
            with open("/tmp/shared_state.json", "w") as f:
                json.dump(state, f)
            # Lock released when exiting context
"""

import asyncio

from f.internal._file_lock import FileLockError, exclusive_file_lock, shared_file_lock


async def concurrent_modifications() -> None:
    """
    Demonstrates exclusive locking preventing race conditions.
    Run multiple instances of this script simultaneously to test.
    """
    test_file = "/tmp/test_counter.txt"

    # Ensure file exists
    try:
        with open(test_file, "w") as f:
            f.write("0")
    except Exception:
        pass

    try:
        with exclusive_file_lock(test_file, timeout_seconds=5):
            # Read
            with open(test_file) as f:
                count = int(f.read().strip())

            print(f"Read count: {count}")

            # Simulate work
            await asyncio.sleep(1)

            # Increment and write
            count += 1
            with open(test_file, "w") as f:
                f.write(str(count))

            print(f"Wrote count: {count}")

    except FileLockError as e:
        print(f"Could not acquire lock: {e}")


async def read_with_shared_lock() -> None:
    """
    Multiple readers can acquire shared lock simultaneously.
    """
    test_file = "/tmp/test_counter.txt"

    try:
        with shared_file_lock(test_file):
            with open(test_file) as f:
                content = f.read()
            print(f"Shared read: {content}")

    except FileLockError as e:
        print(f"Could not acquire lock: {e}")


if __name__ == "__main__":
    asyncio.run(concurrent_modifications())
