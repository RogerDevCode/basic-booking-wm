#!/usr/bin/env python3
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=48.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0",
#   "dateparser>=1.2.0",
#   "rapidfuzz>=3.5.2",
#   "jellyfish>=1.0.3",
#   "python-dotenv>=1.0.1"
# ]
# ///
from __future__ import annotations

import asyncio
import os
import sys
from typing import Any, cast
from dotenv import load_dotenv

# Ensure project root is in sys.path
import pathlib
project_root = str(pathlib.Path(__file__).parent.parent.resolve())
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Ensure wmill is mocked
from unittest.mock import MagicMock
sys.modules["wmill"] = MagicMock()

load_dotenv()

from f.internal._db_client import create_db_client
from f.internal.fsm_router.main import _main_async as fsm_router_main
from f.internal.booking_prefetch.main import (
    _fetch_specialties,
    _fetch_doctors_by_specialty,
    _fetch_slots_for_doctor,
)
from f.internal.booking_confirm.main import _main_async as booking_confirm_main
from f.telegram_auto_register.main import _main_async as telegram_auto_register_main
from f.internal.client_register.main import _main_async as client_register_main

# Test constants
TEST_CHAT_ID = "999999999"
TEST_NAME = "QA Test User"
TEST_PHONE = "+56999999999"
TEST_EMAIL = "qa@test.com"


class QATestSession:
    def __init__(self, pg_url: str):
        self.pg_url = pg_url
        self.state: dict[str, Any] = {}
        self.client_id: str | None = None
        self.phone: str | None = None
        self.client_name: str | None = None

    async def reset_db_state(self) -> None:
        """Clean up any pre-existing test data in the database."""
        db = await create_db_client(self.pg_url)
        try:
            # Delete bookings associated with the test chat id
            # Note: We must join with clients table to find bookings for our test client
            client_row = await db.fetchrow("SELECT client_id FROM clients WHERE telegram_chat_id = $1", TEST_CHAT_ID)
            if client_row:
                client_uuid = client_row["client_id"]
                await db.execute("DELETE FROM bookings WHERE client_id = $1", client_uuid)
                await db.execute("DELETE FROM clients WHERE client_id = $1", client_uuid)
                print(f"[QA Setup] Cleaned up existing test client {client_uuid} and their bookings.")
        finally:
            await db.close()

    async def send_message(
        self,
        user_input: str,
        ai_intent: str | None = None,
        ai_confidence: float | None = None,
        ai_entities: dict[str, Any] | None = None,
        prefetch_items: list[Any] | None = None,
        requires_fsm_routing: bool = True,
    ) -> dict[str, Any]:
        """Simulate sending a message to the fsm_router and updating local session state."""
        args: dict[str, Any] = {
            "chat_id": TEST_CHAT_ID,
            "user_input": user_input,
            "state": self.state,
            "items": prefetch_items or [],
            "phone": self.phone,
            "client_name": self.client_name,
            "client_id": self.client_id,
            "pg_url": self.pg_url,
            "ai_intent": ai_intent,
            "ai_confidence": ai_confidence,
            "ai_entities": ai_entities or {},
            "requires_fsm_routing": requires_fsm_routing,
        }

        print(f"\nUser  >>> {user_input} (Intent: {ai_intent}, Confidence: {ai_confidence})")
        res = await fsm_router_main(args)
        data = cast("dict[str, Any]", res["data"])

        # Update local session tracking based on router response
        if data.get("handled"):
            if "nextState" in data:
                self.state["booking_state"] = data["nextState"]
            if "active_flow" in data:
                self.state["active_flow"] = data["active_flow"]
            if "nextDraft" in data:
                self.state["booking_draft"] = data["nextDraft"]
            print(f"Bot   <<< {data.get('response_text')}")
            print(f"State === {self.state.get('booking_state')}")
        else:
            print("Bot   <<< [Not handled by FSM - delegated to conversational router/AI fallback]")

        return data


async def run_full_qa_suite() -> None:
    pg_url = os.getenv("DATABASE_URL")
    if not pg_url:
        print("ERROR: DATABASE_URL not set in environment.")
        sys.exit(1)

    print("======================================================================")
    print("STARTING QA TEST SUITE: RECURSIVE FSM & DATABASE INTEGRATION VALIDATION")
    print("======================================================================")

    session = QATestSession(pg_url)

    # 1. Reset database state before starting
    await session.reset_db_state()

    # 1a. Run auto register to create the client row
    print("\n--- PHASE 0: Telegram Auto Registration ---")
    reg_res = await telegram_auto_register_main(
        {"chat_id": TEST_CHAT_ID, "first_name": "QA", "last_name": "Test User", "username": "qa_test"},
        pg_url=pg_url
    )
    print(f"Auto-registration result: {reg_res}")
    session.client_id = str(reg_res["client_id"])
    session.client_name = str(reg_res["name"])

    # 2. Test /start command when user is completely unregistered
    print("\n--- PHASE 1: /start Command for Unregistered User ---")
    res = await session.send_message("/start")
    assert res["handled"] is True
    assert res["nextState"]["name"] == "idle"

    # 3. Test Agendar intent starting registration flow
    print("\n--- PHASE 2: Start Registration Flow ---")
    # Temporarily set client_id to None in the input to force the full FSM registration flow,
    # simulating an unregistered client.
    original_client_id = session.client_id
    session.client_id = None
    res = await session.send_message("quiero agendar", ai_intent="crear_cita", ai_confidence=0.95)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "needs_registration"

    # 3a. Test invalid response in needs_registration
    print("\n--- PHASE 2a: Invalid Response in registration prompt ---")
    res = await session.send_message("tal vez")
    assert res["handled"] is True
    assert res["nextState"]["name"] == "needs_registration"
    assert res["nextState"].get("invalid_attempts") == 1

    # 3b. Confirm starting registration ("sí")
    print("\n--- PHASE 2b: Confirm Registration ---")
    res = await session.send_message("sí")
    assert res["handled"] is True
    assert res["nextState"]["name"] == "reg_confirming_name"

    # 3c. Confirm default name "TestUser"
    print("\n--- PHASE 2c: Confirm Default Name ---")
    session.client_name = TEST_NAME
    res = await session.send_message("sí")
    assert res["handled"] is True
    assert res["nextState"]["name"] == "reg_collecting_phone"

    # 3d. Provide phone number
    print("\n--- PHASE 2d: Enter Phone ---")
    res = await session.send_message(TEST_PHONE)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "reg_collecting_email"

    # 3e. Provide email & complete registration
    print("\n--- PHASE 2e: Enter Email & Finalize Registration ---")
    res = await session.send_message(TEST_EMAIL)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "idle"
    assert "registration_data" in res
    reg_data = res["registration_data"]
    assert reg_data["name"] == TEST_NAME
    assert reg_data["phone"] == TEST_PHONE
    assert reg_data["email"] == TEST_EMAIL

    # Restore the actual client_id and run the registration update step (client_register)
    session.client_id = original_client_id
    print(f"\n[QA DB Update] Updating client details in database using client_register...")
    update_res = await client_register_main(
        client_id=session.client_id,
        name=reg_data["name"],
        phone=reg_data["phone"],
        email=reg_data["email"],
        pg_url=pg_url
    )
    print(f"Client register update result: {update_res}")
    assert update_res["success"] is True

    # Simular base de datos actualizando el cliente
    db = await create_db_client(pg_url)
    try:
        # Resolve client_id from database
        client_row = await db.fetchrow("SELECT client_id, phone, name FROM clients WHERE telegram_chat_id = $1", TEST_CHAT_ID)
        assert client_row is not None
        session.client_id = str(client_row["client_id"])
        session.phone = str(client_row["phone"])
        session.client_name = str(client_row["name"])
        print(f"\n[QA DB Verify] Successfully registered client UUID: {session.client_id}")

        # Fetch specialties for Phase 3 prefetching
        specialties = await _fetch_specialties(db)
        print(f"[QA DB Verify] Fetched {len(specialties)} specialties from database.")
        assert len(specialties) > 0, "No specialties available in database"
        target_specialty = specialties[0]
    finally:
        await db.close()

    # 4. Phase 3: Booking Flow - Selecting Specialty
    print("\n--- PHASE 3: Booking Flow - Specialty Selection ---")
    # Initiate agendar again, now registered
    res = await session.send_message("quiero agendar", ai_intent="crear_cita", ai_confidence=0.95, prefetch_items=specialties)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "selecting_specialty"

    # Test invalid option selection
    print("\n--- PHASE 3a: Select Invalid Specialty ---")
    res = await session.send_message("99", prefetch_items=specialties)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "selecting_specialty"
    assert "Opción inválida" in res["response_text"]

    # Select valid specialty index
    print("\n--- PHASE 3b: Select Valid Specialty (Index 1) ---")
    # Resolve doctors for this specialty from DB first
    db = await create_db_client(pg_url)
    try:
        doctors = await _fetch_doctors_by_specialty(db, target_specialty["id"])
        print(f"[QA DB Verify] Fetched {len(doctors)} doctors for specialty: {target_specialty['name']}.")
        assert len(doctors) > 0, f"No doctors registered for specialty: {target_specialty['name']}"
        target_doctor = doctors[0]
    finally:
        await db.close()

    res = await session.send_message("1", prefetch_items=doctors)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "selecting_doctor"
    assert res["nextState"]["specialtyId"] == target_specialty["id"]

    # 5. Phase 4: Selecting Doctor
    print("\n--- PHASE 4: Selecting Doctor ---")
    # Test Back action from Doctor selection to Specialty selection
    print("\n--- PHASE 4a: Test Back Action from Doctor Selection ---")
    res = await session.send_message("volver", prefetch_items=specialties)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "selecting_specialty"

    # Select specialty again to go forward
    res = await session.send_message("1", prefetch_items=doctors)

    # Test invalid doctor selection
    print("\n--- PHASE 4b: Select Invalid Doctor ---")
    res = await session.send_message("99", prefetch_items=doctors)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "selecting_doctor"
    assert "Opción inválida" in res["response_text"]

    # Select valid doctor index
    print("\n--- PHASE 4c: Select Valid Doctor (Find one with slots) ---")
    target_doctor = None
    slots = []
    doc_index = -1
    db = await create_db_client(pg_url)
    try:
        for idx, doc in enumerate(doctors):
            doc_slots = await _fetch_slots_for_doctor(db, doc["id"])
            if doc_slots:
                target_doctor = doc
                slots = doc_slots
                doc_index = idx + 1
                break
    finally:
        await db.close()

    assert target_doctor is not None, "None of the doctors have available slots"
    print(f"[QA DB Verify] Selected doctor: {target_doctor['name']} (index {doc_index}) with {len(slots)} slots.")
    target_slot = slots[0]

    res = await session.send_message(str(doc_index), prefetch_items=slots)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "selecting_time"
    assert res["nextState"]["doctorId"] == target_doctor["id"]

    # 6. Phase 5: Selecting Time Slot
    print("\n--- PHASE 5: Selecting Time ---")
    # Test Back action from Time selection to Doctor selection
    print("\n--- PHASE 5a: Test Back Action from Time Selection ---")
    res = await session.send_message("volver", prefetch_items=doctors)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "selecting_doctor"

    # Select doctor again to go forward
    res = await session.send_message(str(doc_index), prefetch_items=slots)

    # Test invalid slot selection
    print("\n--- PHASE 5b: Select Invalid Slot ---")
    res = await session.send_message("99", prefetch_items=slots)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "selecting_time"
    assert "Opción inválida" in res["response_text"]

    # Select valid slot index
    print("\n--- PHASE 5c: Select Valid Slot (Index 1) ---")
    res = await session.send_message("1", prefetch_items=slots)
    assert res["handled"] is True
    assert res["nextState"]["name"] == "confirming"

    # 7. Phase 6: Confirming booking FSM state
    print("\n--- PHASE 6: Confirming Booking ---")
    # Test invalid confirmation response handling
    print("\n--- PHASE 6a: Test Invalid Confirmation ---")
    res = await session.send_message("tal vez")
    assert res["handled"] is True
    assert res["nextState"]["name"] == "confirming"
    assert res["nextState"].get("invalid_attempts") == 1

    # Confirm the booking ("sí")
    print("\n--- PHASE 6b: Confirm YES ---")
    res = await session.send_message("sí")
    assert res["handled"] is True
    assert res["nextState"]["name"] == "idle"
    assert "Procesando tu reserva" in res["response_text"]

    # 8. Phase 7: Booking Commit (Database transaction)
    print("\n--- PHASE 7: Database Booking Insertion (booking_confirm) ---")
    booking_res = await booking_confirm_main(
        client_id=session.client_id,
        provider_id=target_doctor["id"],
        start_time=target_slot["start_time"],
        chat_id=TEST_CHAT_ID,
        pg_url=pg_url,
    )
    print(f"Booking confirmation outcome: {booking_res}")
    assert booking_res["success"] is True
    booking_id = booking_res["booking_id"]
    assert booking_id is not None

    # Verify booking exists in DB and is active
    db = await create_db_client(pg_url)
    try:
        booking_row = await db.fetchrow(
            "SELECT booking_id, status, client_id, provider_id FROM bookings WHERE booking_id = $1::uuid",
            booking_id,
        )
        assert booking_row is not None
        assert booking_row["status"] == "confirmed"
        assert str(booking_row["client_id"]) == session.client_id
        assert str(booking_row["provider_id"]) == target_doctor["id"]
        print(f"[QA DB Verify] Booking confirmed successfully in DB: {booking_id}")
    finally:
        await db.close()

    # 9. Phase 8: Query bookings ("Mis Horas")
    print("\n--- PHASE 8: Check Registered Appointments ('Mis Horas') ---")
    res = await session.send_message("ver mis citas", ai_intent="ver_mis_citas", ai_confidence=0.95)
    assert res["handled"] is True
    assert "Roger Gallegos" in res["response_text"] or "Ricardo Valenzuela" in res["response_text"] or "Carolina Muñoz" in res["response_text"]
    assert booking_res["booking_short_id"] in res["response_text"]

    # 10. Phase 9: Cancellation flow (cancel booking)
    print("\n--- PHASE 9: Cancel Active Booking ---")
    # Simulate orchestrator workflow for cancellation or run manual cancel sql to verify status updates
    db = await create_db_client(pg_url)
    try:
        # Cancel the booking
        await db.execute(
            "UPDATE bookings SET status = 'cancelled' WHERE booking_id = $1::uuid",
            booking_id,
        )
        # Verify status is updated
        updated_row = await db.fetchrow("SELECT status FROM bookings WHERE booking_id = $1::uuid", booking_id)
        assert updated_row is not None
        assert updated_row["status"] == "cancelled"
        print(f"[QA DB Verify] Booking cancelled successfully in DB: {booking_id}")
    finally:
        await db.close()

    # Query mis citas again and verify it is empty
    print("\n--- PHASE 9a: Check 'Mis Horas' after Cancellation ---")
    res = await session.send_message("ver mis citas", ai_intent="ver_mis_citas", ai_confidence=0.95)
    assert res["handled"] is True
    assert "No tienes horas próximas agendadas" in res["response_text"]

    # 11. Clean up
    print("\n--- PHASE 10: Clean up QA Data ---")
    await session.reset_db_state()

    print("\n======================================================================")
    print("QA TESTS PASSED SUCCESSFULLY! ALL VERIFICATIONS AND STATE INVARIANTS MET")
    print("======================================================================")


if __name__ == "__main__":
    asyncio.run(run_full_qa_suite())
