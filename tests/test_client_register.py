from __future__ import annotations

import os
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

if TYPE_CHECKING:
    from contextlib import AbstractContextManager

# ── Constants ──────────────────────────────────────────────────────────────────

_CLIENT_ID = "a1b2c3d4-1111-2222-3333-444455556666"
_PG_URL = "postgresql://user:pass@localhost/testdb"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_db() -> MagicMock:
    """Return a mock DB client with execute and close stubs."""
    db = MagicMock()
    db.execute = AsyncMock(return_value="UPDATE 1")
    db.close = AsyncMock()
    return db


def _patch_db(db: MagicMock) -> AbstractContextManager[MagicMock]:
    return patch(
        "f.internal.client_register.main.create_db_client",
        AsyncMock(return_value=db),
    )


# ── Tests: phone-only update ───────────────────────────────────────────────────


class TestClientRegisterPhoneUpdate:
    @pytest.mark.asyncio
    async def test_phone_update_returns_updated_true(self) -> None:
        """Providing only phone returns success=True, updated=True."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            result = await _main_async(client_id=_CLIENT_ID, phone="+34600000001")

        assert result["success"] is True
        assert result["updated"] is True

    @pytest.mark.asyncio
    async def test_phone_update_calls_execute_once(self) -> None:
        """A single field update issues exactly one DB execute call."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(client_id=_CLIENT_ID, phone="+34600000002")

        db.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_phone_update_query_contains_client_id(self) -> None:
        """The UPDATE statement is parameterised with the given client_id."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(client_id=_CLIENT_ID, phone="+34600000003")

        call_args = db.execute.call_args
        # client_id must appear somewhere in the positional arguments
        assert _CLIENT_ID in call_args.args

    @pytest.mark.asyncio
    async def test_phone_update_name_and_email_not_in_query(self) -> None:
        """When only phone is provided, name and email values are NOT passed to DB."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(client_id=_CLIENT_ID, phone="+34600000004")

        call_args = db.execute.call_args
        positional = call_args.args
        # name and email are None — their sentinel strings must not appear
        assert "name" not in positional
        assert "email" not in positional

    @pytest.mark.asyncio
    async def test_phone_update_closes_db(self) -> None:
        """DB connection is always closed after phone update."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(client_id=_CLIENT_ID, phone="+34600000005")

        db.close.assert_awaited_once()


# ── Tests: all-fields update ───────────────────────────────────────────────────


class TestClientRegisterAllFields:
    @pytest.mark.asyncio
    async def test_all_fields_returns_updated_true(self) -> None:
        """name + phone + email all provided → success=True, updated=True."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            result = await _main_async(
                client_id=_CLIENT_ID,
                name="María López",
                phone="+34600000010",
                email="maria@example.com",
            )

        assert result["success"] is True
        assert result["updated"] is True

    @pytest.mark.asyncio
    async def test_all_fields_values_passed_to_db(self) -> None:
        """All three field values appear in the execute call arguments."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(
                client_id=_CLIENT_ID,
                name="María López",
                phone="+34600000011",
                email="maria@example.com",
            )

        call_args = db.execute.call_args
        positional = call_args.args
        assert "María López" in positional
        assert "+34600000011" in positional
        assert "maria@example.com" in positional

    @pytest.mark.asyncio
    async def test_all_fields_execute_called_once(self) -> None:
        """All three fields are written in a single UPDATE, not multiple calls."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(
                client_id=_CLIENT_ID,
                name="Ana García",
                phone="+34600000012",
                email="ana@example.com",
            )

        db.execute.assert_awaited_once()


# ── Tests: no-fields → skip DB ─────────────────────────────────────────────────


class TestClientRegisterNoFields:
    @pytest.mark.asyncio
    async def test_no_fields_returns_updated_false(self) -> None:
        """When name/phone/email are all None, returns updated=False."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            result = await _main_async(client_id=_CLIENT_ID)

        assert result["success"] is True
        assert result["updated"] is False

    @pytest.mark.asyncio
    async def test_no_fields_does_not_call_db(self) -> None:
        """When there is nothing to update, execute is never called."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(client_id=_CLIENT_ID)

        db.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_fields_does_not_call_create_db_client(self) -> None:
        """When nothing to update, create_db_client is never invoked."""
        mock_factory = AsyncMock()
        with patch("f.internal.client_register.main.create_db_client", mock_factory):
            from f.internal.client_register.main import _main_async

            await _main_async(client_id=_CLIENT_ID)

        mock_factory.assert_not_awaited()


# ── Tests: pg_url injection ────────────────────────────────────────────────────


class TestClientRegisterPgUrlInjection:
    @pytest.mark.asyncio
    async def test_pg_url_sets_database_url_env(self) -> None:
        """Providing pg_url writes it into os.environ['DATABASE_URL']."""
        db = _make_db()
        # Ensure the env var is absent before the call
        os.environ.pop("DATABASE_URL", None)
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(client_id=_CLIENT_ID, phone="+34600000020", pg_url=_PG_URL)

        assert os.environ.get("DATABASE_URL") == _PG_URL

    @pytest.mark.asyncio
    async def test_no_pg_url_does_not_override_env(self) -> None:
        """When pg_url is omitted, the existing DATABASE_URL is not replaced."""
        original = "postgresql://original@localhost/orig"
        os.environ["DATABASE_URL"] = original
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import _main_async

            await _main_async(client_id=_CLIENT_ID, name="Test")

        assert os.environ.get("DATABASE_URL") == original


# ── Tests: sync wrapper (WM-01) ────────────────────────────────────────────────


class TestClientRegisterSyncWrapper:
    def test_main_is_not_a_coroutine_function(self) -> None:
        """main() must be a plain sync function, not async (WM-01)."""
        import inspect

        from f.internal.client_register.main import main

        assert callable(main)
        assert not inspect.iscoroutinefunction(main)

    def test_main_returns_dict_on_success(self) -> None:
        """main() calls asyncio.run(_main_async) and returns a plain dict."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import main

            result = main(client_id=_CLIENT_ID, phone="+34600000030")

        assert isinstance(result, dict)
        assert result["success"] is True
        assert result["updated"] is True

    def test_main_no_fields_returns_updated_false_sync(self) -> None:
        """main() with no optional fields returns updated=False synchronously."""
        db = _make_db()
        with _patch_db(db):
            from f.internal.client_register.main import main

            result = main(client_id=_CLIENT_ID)

        assert isinstance(result, dict)
        assert result["success"] is True
        assert result["updated"] is False
