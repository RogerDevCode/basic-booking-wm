from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_redis(*, nx_return: object = True) -> MagicMock:
    """Return a mock Redis client whose SET NX returns *nx_return*."""
    r = MagicMock()
    r.set = AsyncMock(return_value=nx_return)
    r.aclose = AsyncMock()
    return r


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestDeduplicateFirstSeen:
    @pytest.mark.asyncio
    async def test_new_update_id_not_duplicate(self) -> None:
        """First time an update_id is seen → duplicate=False."""
        redis = _make_redis(nx_return=True)  # SET NX succeeded → key was new

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            result = await _main_async(update_id=100, chat_id="42")

        assert result["duplicate"] is False
        assert result["update_id"] == 100
        redis.set.assert_awaited_once_with("dedup:upd:100", "1", nx=True, ex=3600)
        redis.aclose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_set_nx_called_with_correct_key_and_ttl(self) -> None:
        """Key must be `dedup:upd:<update_id>` with 1-hour TTL."""
        redis = _make_redis(nx_return=True)

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            await _main_async(update_id=999, chat_id="7")

        call_kwargs = redis.set.call_args
        assert call_kwargs.args[0] == "dedup:upd:999"
        assert call_kwargs.kwargs["ex"] == 3600
        assert call_kwargs.kwargs["nx"] is True


class TestDeduplicateAlreadySeen:
    @pytest.mark.asyncio
    async def test_repeated_update_id_is_duplicate(self) -> None:
        """SET NX returns None → key already existed → duplicate=True."""
        redis = _make_redis(nx_return=None)

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            result = await _main_async(update_id=200, chat_id="42")

        assert result["duplicate"] is True
        assert result["update_id"] == 200

    @pytest.mark.asyncio
    async def test_duplicate_still_closes_redis(self) -> None:
        """Redis must be closed even when message is a duplicate."""
        redis = _make_redis(nx_return=None)

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            await _main_async(update_id=201, chat_id="42")

        redis.aclose.assert_awaited_once()


class TestDeduplicateNullUpdateId:
    @pytest.mark.asyncio
    async def test_none_update_id_passes_through(self) -> None:
        """update_id=None → skip Redis entirely, return duplicate=False."""
        redis = _make_redis()

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            result = await _main_async(update_id=None, chat_id="42")

        assert result["duplicate"] is False
        assert result["update_id"] is None
        redis.set.assert_not_awaited()
        redis.aclose.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_zero_update_id_passes_through(self) -> None:
        """update_id=0 is falsy → treated same as None."""
        redis = _make_redis()

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            result = await _main_async(update_id=0, chat_id="42")

        assert result["duplicate"] is False
        redis.set.assert_not_awaited()


class TestDeduplicateRedisFailure:
    @pytest.mark.asyncio
    async def test_redis_error_fails_open(self) -> None:
        """Redis connection failure → fail-open: duplicate=False so message is processed."""
        redis = MagicMock()
        redis.set = AsyncMock(side_effect=ConnectionError("Redis unreachable"))
        redis.aclose = AsyncMock()

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            result = await _main_async(update_id=300, chat_id="42")

        assert result["duplicate"] is False
        assert result["update_id"] == 300

    @pytest.mark.asyncio
    async def test_redis_error_still_closes_connection(self) -> None:
        """Even on error, aclose() must be called in the finally block."""
        redis = MagicMock()
        redis.set = AsyncMock(side_effect=RuntimeError("boom"))
        redis.aclose = AsyncMock()

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            await _main_async(update_id=301, chat_id="42")

        redis.aclose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_redis_create_failure_raises(self) -> None:
        """If create_redis_client itself raises, exception propagates (no swallowing outside try)."""
        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(side_effect=RuntimeError("cannot connect")),
        ):
            from f.internal.telegram_deduplicate.main import _main_async

            with pytest.raises(RuntimeError, match="cannot connect"):
                await _main_async(update_id=302, chat_id="42")


class TestDeduplicateSyncWrapper:
    def test_main_sync_wrapper_returns_dict(self) -> None:
        """main() must be sync and return a plain dict (WM-01)."""
        redis = _make_redis(nx_return=True)

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import main

            result = main(update_id=400, chat_id="55", redis_url="redis://localhost:6379")

        assert isinstance(result, dict)
        assert result["duplicate"] is False

    def test_main_signature_accepts_none_redis_url(self) -> None:
        """redis_url=None should be accepted (uses default URL)."""
        redis = _make_redis(nx_return=True)

        with patch(
            "f.internal.telegram_deduplicate.main.create_redis_client",
            AsyncMock(return_value=redis),
        ):
            from f.internal.telegram_deduplicate.main import main

            result = main(update_id=401, chat_id="55")

        assert "duplicate" in result
