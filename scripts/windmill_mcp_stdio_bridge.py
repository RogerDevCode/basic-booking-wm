#!/usr/bin/env python3
from __future__ import annotations

import logging
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Final

import anyio
from dotenv import dotenv_values
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Mapping

    from mcp import types

LOGGER: Final[logging.Logger] = logging.getLogger("windmill_mcp_stdio_bridge")
SCRIPT_DIR: Final[Path] = Path(__file__).resolve().parent
PROJECT_ROOT: Final[Path] = SCRIPT_DIR.parent
ENV_FILES: Final[tuple[Path, ...]] = (PROJECT_ROOT / ".env", PROJECT_ROOT / ".env.wm")
REMOTE_URL_KEY: Final[str] = "WM_TOKEN_URL"
SERVER_NAME: Final[str] = "windmill"
SERVER_VERSION: Final[str] = "1.0.0"


@dataclass(frozen=True)
class BridgeConfig:
    remote_url: str


@dataclass
class BridgeContext:
    session: ClientSession


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _load_bridge_config() -> BridgeConfig:
    merged_values: dict[str, str] = {}
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        raw_values: Mapping[str, str | None] = dotenv_values(env_file)
        for key, value in raw_values.items():
            if value is None:
                continue
            merged_values[key] = value

    remote_url = merged_values.get(REMOTE_URL_KEY, "").strip()
    if remote_url == "":
        raise RuntimeError(f"Missing {REMOTE_URL_KEY} in project env files")

    return BridgeConfig(remote_url=remote_url)


@asynccontextmanager
async def _bridge_lifespan(_: Server[BridgeContext, object]) -> AsyncIterator[BridgeContext]:
    config = _load_bridge_config()
    exit_stack = AsyncExitStack()
    try:
        read_stream, write_stream, _ = await exit_stack.enter_async_context(
            streamablehttp_client(url=config.remote_url)
        )
        session = await exit_stack.enter_async_context(ClientSession(read_stream, write_stream))
        await session.initialize()
        LOGGER.info("Connected to remote Windmill MCP")
        yield BridgeContext(session=session)
    except Exception as exc:
        LOGGER.exception("Failed to initialize Windmill MCP bridge")
        raise RuntimeError(f"Failed to initialize Windmill MCP bridge: {exc}") from exc
    finally:
        await exit_stack.aclose()


def _build_server() -> Server[BridgeContext, object]:
    server: Server[BridgeContext, object] = Server(
        name=SERVER_NAME,
        version=SERVER_VERSION,
        instructions="Local stdio bridge for the Windmill MCP endpoint configured in this project.",
        lifespan=_bridge_lifespan,
    )

    @server.list_tools()
    async def _list_tools() -> list[types.Tool]:
        context = server.request_context.lifespan_context
        result = await context.session.list_tools()
        return result.tools

    @server.call_tool(validate_input=False)
    async def _call_tool(name: str, arguments: dict[str, object]) -> types.CallToolResult:
        context = server.request_context.lifespan_context
        return await context.session.call_tool(name=name, arguments=arguments)

    return server


async def _main_async() -> None:
    server = _build_server()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name=SERVER_NAME,
                server_version=SERVER_VERSION,
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
                instructions=server.instructions,
            ),
        )


def main() -> None:
    _configure_logging()
    anyio.run(_main_async)


if __name__ == "__main__":
    main()
