from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

if TYPE_CHECKING:
    from contextlib import AbstractContextManager

# ── Helpers ────────────────────────────────────────────────────────────────────

_NEW_CLIENT_ID = "new-client-uuid-5678"
_EXISTING_CLIENT_ID = "existing-client-uuid-9999"


def _make_db(*, existing_client_id: str | None = None) -> MagicMock:
    """Return a mock DB client.

    New client:      SELECT clients → [] | INSERT clients → [client_id]  (2 calls)
    Existing client: SELECT clients → [client_id]                        (1 call)
    """
    db = MagicMock()
    if existing_client_id:
        db.fetch = AsyncMock(side_effect=[[{"client_id": existing_client_id}]])
    else:
        db.fetch = AsyncMock(
            side_effect=[
                [],
                [{"client_id": _NEW_CLIENT_ID}],
            ]
        )
    db.close = AsyncMock()
    return db


def _patch_db(db: MagicMock) -> AbstractContextManager[MagicMock]:
    return patch(
        "f.telegram_auto_register.main.create_db_client",
        AsyncMock(return_value=db),
    )


def _patch_admin_ctx() -> AbstractContextManager[MagicMock]:
    """Bypass with_admin_context — just calls the operation directly."""

    async def _passthrough(conn: object, op: object) -> object:
        return await op()  # type: ignore[operator]

    return patch("f.telegram_auto_register.main.with_admin_context", side_effect=_passthrough)


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestAutoRegisterNewUser:
    @pytest.mark.asyncio
    async def test_new_user_registered_successfully(self) -> None:
        """New chat_id creates client row, returns is_new=True."""
        db = _make_db(existing_client_id=None)
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            err, result = await _main_async(
                {"chat_id": "111", "first_name": "Ana", "last_name": None, "username": "ana_t"}
            )

        assert err is None
        assert result is not None
        assert result["client_id"] == _NEW_CLIENT_ID
        assert result["user_id"] == _NEW_CLIENT_ID  # user_id aliases client_id
        assert result["is_new"] is True

    @pytest.mark.asyncio
    async def test_new_user_db_called_twice(self) -> None:
        """New client: SELECT clients → INSERT clients = 2 calls."""
        db = _make_db(existing_client_id=None)
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            await _main_async({"chat_id": "222", "first_name": "Luis", "last_name": "Gómez", "username": None})

        assert db.fetch.call_count == 2

    @pytest.mark.asyncio
    async def test_new_user_full_name_with_last_name(self) -> None:
        """Full name must be 'first_name last_name' when last_name is provided."""
        db = _make_db(existing_client_id=None)
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            await _main_async({"chat_id": "333", "first_name": "María", "last_name": "López", "username": None})

        # Second call is INSERT clients — check full_name argument
        insert_call = db.fetch.call_args_list[1]
        assert "María López" in insert_call.args


class TestAutoRegisterExistingUser:
    @pytest.mark.asyncio
    async def test_existing_user_returns_is_new_false(self) -> None:
        """Known chat_id returns existing client_id with is_new=False."""
        db = _make_db(existing_client_id=_EXISTING_CLIENT_ID)
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            err, result = await _main_async(
                {"chat_id": "444", "first_name": "Carlos", "last_name": None, "username": "carlos_x"}
            )

        assert err is None
        assert result is not None
        assert result["client_id"] == _EXISTING_CLIENT_ID
        assert result["user_id"] == _EXISTING_CLIENT_ID
        assert result["is_new"] is False

    @pytest.mark.asyncio
    async def test_existing_user_db_called_once(self) -> None:
        """Existing client: SELECT clients only = 1 call."""
        db = _make_db(existing_client_id=_EXISTING_CLIENT_ID)
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            await _main_async({"chat_id": "555", "first_name": "Pedro", "last_name": None, "username": None})

        assert db.fetch.call_count == 1


class TestAutoRegisterValidation:
    @pytest.mark.asyncio
    async def test_missing_chat_id_returns_error(self) -> None:
        """chat_id is required — validation failure returns err tuple."""
        db = _make_db()
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            err, result = await _main_async({"first_name": "X"})

        assert err is not None
        assert result is None

    @pytest.mark.asyncio
    async def test_empty_chat_id_returns_error(self) -> None:
        """Empty chat_id violates min_length=1 constraint."""
        db = _make_db()
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            err, result = await _main_async({"chat_id": "", "first_name": "X"})

        assert err is not None
        assert result is None

    @pytest.mark.asyncio
    async def test_missing_first_name_returns_error(self) -> None:
        """first_name is required — validation failure returns err tuple."""
        db = _make_db()
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            err, _result = await _main_async({"chat_id": "777"})

        assert err is not None


class TestAutoRegisterDBFailure:
    @pytest.mark.asyncio
    async def test_insert_failure_returns_error(self) -> None:
        """Failed INSERT returns error tuple, does not raise."""
        db = MagicMock()
        # SELECT clients → [] (new), INSERT clients → [] (failure)
        db.fetch = AsyncMock(side_effect=[[], []])
        db.close = AsyncMock()
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            err, result = await _main_async({"chat_id": "888", "first_name": "Test"})

        assert err is not None
        assert result is None

    @pytest.mark.asyncio
    async def test_db_exception_returns_error(self) -> None:
        """DB exception is caught and returned as error tuple."""
        db = MagicMock()
        db.fetch = AsyncMock(side_effect=ConnectionError("DB down"))
        db.close = AsyncMock()
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import _main_async

            err, result = await _main_async({"chat_id": "999", "first_name": "Test"})

        assert err is not None
        assert result is None


class TestAutoRegisterSyncWrapper:
    def test_main_sync_raises_on_db_error(self) -> None:
        """main() must be sync (WM-01) and raise RuntimeError on failure."""
        db = MagicMock()
        db.fetch = AsyncMock(side_effect=RuntimeError("boom"))
        db.close = AsyncMock()
        with _patch_db(db), _patch_admin_ctx():
            from f.telegram_auto_register.main import main

            with pytest.raises(RuntimeError):
                main({"chat_id": "1", "first_name": "X"})
