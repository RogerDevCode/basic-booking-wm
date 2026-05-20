import asyncio

from f.internal.fsm_router.main import _main_async


async def main() -> None:
    args: dict[str, object] = {
        "chat_id": "12345",
        "user_input": "/start",
        "state": {"name": "idle"},
        "requires_fsm_routing": True,
    }
    try:
        res = await _main_async(args)
        print(res)
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
