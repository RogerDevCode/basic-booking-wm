from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from f.patient_register._patient_logic import upsert_client
from f.patient_register._patient_models import InputSchema


@pytest.mark.asyncio
async def test_upsert_client_insert_success() -> None:
    db = AsyncMock()

    input_data = InputSchema(name="Jane Doe", email="jane@example.com", phone="5551234")

    # Note: InputSchema has telegram_chat_id: None by default
    # So it skips telegram check.
    # It will call:
    # 1. db.fetch(email)
    # 2. db.fetch(phone)
    # 3. db.fetch(insert)

    db.fetch.side_effect = [
        [],  # Email lookup
        [],  # Phone lookup
        [
            {  # Insert Result
                "client_id": "c1",
                "name": "Jane Doe",
                "email": "jane@example.com",
                "phone": "5551234",
                "telegram_chat_id": None,
                "timezone": "America/Santiago",
            }
        ],
    ]

    err, res = await upsert_client(db, input_data)

    if err:
        print(f"DEBUG ERROR: {err}")

    assert err is None
    assert res is not None
    assert res["created"] is True
    assert res["client_id"] == "c1"


@pytest.mark.asyncio
async def test_upsert_client_update_by_telegram() -> None:
    db = AsyncMock()
    # 1. Telegram lookup -> FOUND
    # 2. Update -> Result
    db.fetch.side_effect = [
        [{"client_id": "existing-uuid"}],  # Telegram lookup
        [
            {  # Update Result
                "client_id": "existing-uuid",
                "name": "Updated Name",
                "email": "jane@example.com",
                "phone": "5551234",
                "telegram_chat_id": "tg123",
                "timezone": "America/Santiago",
            }
        ],
    ]

    input_data = InputSchema(name="Updated Name", telegram_chat_id="tg123")

    err, res = await upsert_client(db, input_data)

    assert err is None
    assert res is not None
    assert res["created"] is False
    assert res["client_id"] == "existing-uuid"


@pytest.mark.asyncio
async def test_upsert_client_db_error_capture() -> None:
    db = AsyncMock()
    db.fetch.side_effect = Exception("DB Connection Lost")

    # If name/email provided, it will first check Telegram (if None, skips), then Email.
    input_data = InputSchema(name="Fail", email="f@f.com")

    err, res = await upsert_client(db, input_data)

    assert err is not None
    # With only email, it calls fetch for email lookup first
    assert "db_search_email_failed" in str(err)
    assert res is None
