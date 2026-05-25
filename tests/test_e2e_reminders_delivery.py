from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from dotenv import load_dotenv
from httpx import Response

from f.internal._db_client import create_db_client
from f.internal._wmill_adapter import wmill
from f.reminder_cron.main import _main_async as run_cron

load_dotenv()
db_url = os.getenv("DATABASE_URL")

# Skip at module level if DATABASE_URL is not set (typical in CI without services)
if not db_url:
    pytest.skip("DATABASE_URL must be set to run E2E tests", allow_module_level=True)


# Requires live PostgreSQL (run with: pytest -m e2e)
@pytest.mark.e2e
@pytest.mark.asyncio
async def test_e2e_reminders_delivery_telegram() -> None:
    booking_id = None
    client_id = None
    service_id = None
    provider_id = None
    test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    chat_id = f"test_chat_{uuid.uuid4().hex[:8]}"

    # 1. SETUP DB STATE
    try:
        conn = await create_db_client()
    except Exception as e:
        pytest.skip(f"Database connection failed, skipping E2E test: {e}")
        return

    try:
        # Create a provider with a specific timezone
        provider_id_res = await conn.fetch(
            "INSERT INTO providers (name, email, is_active) VALUES ('Test Prov E2E', $1, true) RETURNING provider_id",
            test_email,
        )
        provider_id = provider_id_res[0]["provider_id"]

        service_id_res = await conn.fetch(
            "INSERT INTO services (provider_id, name, duration_minutes, is_active) VALUES ($1::uuid, 'Test Service', 30, true) RETURNING service_id",
            provider_id,
        )
        service_id = service_id_res[0]["service_id"]

        # Create a client with Telegram Chat ID
        client_id_res = await conn.fetch(
            "INSERT INTO clients (name, telegram_chat_id) VALUES ('Test Client', $1) RETURNING client_id", chat_id
        )
        client_id = client_id_res[0]["client_id"]

        # 2. INSERT A BOOKING SCHEDULED FOR TOMORROW (1day reminder window)
        now_utc = datetime.now(UTC)
        start_time = now_utc + timedelta(days=1)
        # Ensure it falls neatly into exactly 24 hours from now

        idem_key = f"test_e2e_idem_{uuid.uuid4().hex[:8]}"
        booking_id_res = await conn.fetch(
            """
            INSERT INTO bookings (client_id, provider_id, service_id, start_time, end_time, status, idempotency_key)
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'confirmed', $6)
            RETURNING booking_id
            """,
            client_id,
            provider_id,
            service_id,
            start_time,
            start_time + timedelta(minutes=30),
            idem_key,
        )
        booking_id = booking_id_res[0]["booking_id"]

        # 3. MOCK wmill.run_script_by_path to directly execute telegram_send.main
        def fake_run_script_by_path(path: str, args: dict[str, object]) -> object:
            if path == "f/telegram_send/main.py":
                from f.telegram_send.main import main as telegram_send_main

                # Add mock bot token to bypass checks
                args["bot_token"] = "mock_bot_token"
                try:
                    from threading import Thread

                    result_container: dict[str, object] = {}

                    def run_in_thread() -> None:
                        try:
                            from typing import Any, cast

                            result_container["result"] = telegram_send_main(**cast("dict[str, Any]", args))
                        except Exception as inner_e:
                            result_container["error"] = inner_e

                    t = Thread(target=run_in_thread)
                    t.start()
                    t.join()

                    if "error" in result_container:
                        err = result_container["error"]
                        if isinstance(err, BaseException):
                            raise err
                        raise RuntimeError(str(err))
                    return result_container.get("result")
                except Exception as e:
                    print(f"TELEGRAM SEND FAILED: {e}")
                    raise
            return None

        # 4. EXECUTE CRON (WITH MOCKED TELEGRAM API CALL)
        with patch.object(wmill, "run_script_by_path", side_effect=fake_run_script_by_path):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                with patch("f.reminder_cron.main.is_quiet_hours", return_value=False):
                    mock_post.return_value = Response(200, json={"ok": True, "result": {"message_id": 1}})

                    result = await run_cron({"dry_run": False})

                # Assert cron processed the booking
                assert str(booking_id) in result.processed_bookings
                if result.failed > 0:
                    pytest.fail("Dispatch failed!")
                assert result.sent >= 1

                # Assert HTTP post to telegram API was made
                mock_post.assert_called_once()
                call_args = mock_post.call_args

                # Verify URL
                assert "api.telegram.org/botmock_bot_token/sendMessage" in call_args[0][0]

                # Verify payload
                payload = call_args[1]["json"]
                assert payload["chat_id"] == chat_id
                assert "Recordatorio de tu hora" in payload["text"]
                assert "Test Prov E2E" in payload["text"]

    finally:
        # CLEANUP
        if booking_id:
            await conn.execute("DELETE FROM booking_reminder_dispatches WHERE booking_id = $1::uuid", booking_id)
            await conn.execute("DELETE FROM bookings WHERE booking_id = $1::uuid", booking_id)
        if client_id:
            await conn.execute("DELETE FROM clients WHERE client_id = $1::uuid", client_id)
        if service_id:
            await conn.execute("DELETE FROM services WHERE service_id = $1::uuid", service_id)
        if provider_id:
            await conn.execute("DELETE FROM providers WHERE provider_id = $1::uuid", provider_id)
        await conn.close()
