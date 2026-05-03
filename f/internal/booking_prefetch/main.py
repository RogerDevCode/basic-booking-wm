# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "httpx>=0.28.1",
#   "pydantic>=2.10.0",
#   "email-validator>=2.2.0",
#   "asyncpg>=0.30.0",
#   "cryptography>=44.0.0",
#   "beartype>=0.19.0",
#   "returns>=0.24.0",
#   "redis>=7.4.0",
#   "typing-extensions>=4.12.0"
# ]
# ///
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Final, cast

from .._wmill_adapter import log

if TYPE_CHECKING:
    from .._result import DBClient

MODULE: Final[str] = "booking_prefetch"


async def _connect(pg_url: str) -> DBClient:
    import os

    from .._db_client import create_db_client as _factory

    os.environ["DATABASE_URL"] = pg_url
    return await _factory()


async def _fetch_specialties(db: DBClient) -> list[dict[str, object]]:
    rows = await db.fetch(
        """
        SELECT DISTINCT sp.specialty_id, sp.name, sp.sort_order
        FROM specialties sp
        JOIN providers p ON p.specialty_id = sp.specialty_id
        WHERE p.is_active = true
        ORDER BY sp.sort_order ASC, sp.name ASC
        """
    )
    return [{"id": str(r["specialty_id"]), "name": str(r["name"])} for r in rows]


_DAYS_ES: Final[list[str]] = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
_MONTHS_ES: Final[list[str]] = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def _slot_label(start_iso: str) -> str:
    dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    day = _DAYS_ES[dt.weekday() + 1 if dt.weekday() < 6 else 0]
    return f"{day} {dt.day} {_MONTHS_ES[dt.month]} · {dt.strftime('%H:%M')}"


async def _fetch_slots_for_doctor(db: DBClient, doctor_id: str) -> list[dict[str, object]]:
    from datetime import date, timedelta

    from ..scheduling_engine._scheduling_logic import get_availability_range

    row = await db.fetchrow(
        "SELECT service_id FROM services WHERE provider_id = $1::uuid LIMIT 1",
        doctor_id,
    )
    if not row:
        return []
    service_id = str(row["service_id"])

    today = date.today()
    date_from = today.isoformat()
    date_to = (today + timedelta(days=7)).isoformat()

    err, results = await get_availability_range(db, doctor_id, service_id, date_from, date_to)
    if err:
        log("PREFETCH_SLOTS_ERROR", error=str(err), doctor_id=doctor_id, module=MODULE)
        return []
    if not results:
        return []

    slots: list[dict[str, object]] = []
    for day_result in results:
        for slot in day_result["slots"]:
            if not slot["available"]:
                continue
            start_iso = str(slot["start"])
            slots.append({"id": start_iso, "label": _slot_label(start_iso), "start_time": start_iso})
            if len(slots) >= 8:
                return slots
    return slots


def _resolve_doctor_from_selection(
    user_input: str | None,
    state_items: list[dict[str, object]],
) -> str | None:
    if not user_input or not state_items:
        return None
    stripped = user_input.strip()
    if stripped.startswith("doc:"):
        return stripped[4:]
    if stripped.isdigit():
        idx = int(stripped) - 1
        if 0 <= idx < len(state_items):
            return cast("str | None", state_items[idx].get("id"))
    return None


async def _fetch_doctors_by_specialty(db: DBClient, specialty_id: str) -> list[dict[str, object]]:
    rows = await db.fetch(
        """
        SELECT provider_id, name
        FROM providers
        WHERE specialty_id = $1::uuid AND is_active = true
        ORDER BY name ASC
        """,
        specialty_id,
    )
    return [{"id": str(r["provider_id"]), "name": str(r["name"])} for r in rows]


def _resolve_specialty_from_selection(
    user_input: str | None,
    state_items: list[dict[str, object]],
) -> str | None:
    """If user typed a 1-based index, return the specialty_id at that position."""
    if not user_input or not state_items:
        return None
    stripped = user_input.strip()
    # Support numeric text ("1") and callback_data ("spec:UUID")
    if stripped.startswith("spec:"):
        return stripped[5:]
    if stripped.isdigit():
        idx = int(stripped) - 1
        if 0 <= idx < len(state_items):
            return cast("str | None", state_items[idx].get("id"))
    return None


async def _main_async(
    booking_state: dict[str, object] | None,
    booking_draft: dict[str, object] | None,
    pg_url: str,
    user_input: str | None = None,
) -> dict[str, object]:
    state_name = cast("str", (booking_state or {}).get("name", "idle"))

    db: DBClient = await _connect(pg_url)
    try:
        if state_name == "idle":
            items = await _fetch_specialties(db)
            log("PREFETCH_SPECIALTIES", count=len(items), module=MODULE)
            return {"items": items, "prefetch_type": "specialties"}

        if state_name == "selecting_specialty":
            # Pre-fetch doctors if we can resolve which specialty the user is picking.
            # This avoids a "loading" round-trip: router can show the list immediately.
            state_items = cast("list[dict[str, object]]", (booking_state or {}).get("items", []))
            specialty_id = _resolve_specialty_from_selection(user_input, state_items)
            if specialty_id:
                items = await _fetch_doctors_by_specialty(db, specialty_id)
                log("PREFETCH_DOCTORS_AHEAD", count=len(items), specialty_id=specialty_id, module=MODULE)
                return {"items": items, "prefetch_type": "doctors", "resolved_specialty_id": specialty_id}

        if state_name == "selecting_doctor":
            state_items = cast("list[dict[str, object]]", (booking_state or {}).get("items", []))
            # Pre-fetch slots when user is picking a doctor
            doctor_id = _resolve_doctor_from_selection(user_input, state_items)
            if doctor_id:
                slots = await _fetch_slots_for_doctor(db, doctor_id)
                log("PREFETCH_SLOTS_AHEAD", count=len(slots), doctor_id=doctor_id, module=MODULE)
                return {"items": slots, "prefetch_type": "time_slots", "resolved_doctor_id": doctor_id}
            # Fallback: fetch doctor list if state has no items
            if not state_items:
                draft = booking_draft or {}
                specialty_id = cast("str | None", draft.get("specialty_id"))
                if not specialty_id:
                    specialty_id = cast("str | None", (booking_state or {}).get("specialtyId"))
                if specialty_id:
                    items = await _fetch_doctors_by_specialty(db, specialty_id)
                    log("PREFETCH_DOCTORS", count=len(items), specialty_id=specialty_id, module=MODULE)
                    return {"items": items, "prefetch_type": "doctors"}

        log("PREFETCH_NO_MATCH", state_name=state_name, module=MODULE)
        return {"items": [], "prefetch_type": None}

    except Exception as e:
        import traceback

        log("PREFETCH_ERROR", error=str(e), traceback=traceback.format_exc(), state_name=state_name, module=MODULE)
        return {"items": [], "prefetch_type": None, "error": str(e)}
    finally:
        await db.close()


def main(
    pg_url: str,
    booking_state: dict[str, object] | None = None,
    booking_draft: dict[str, object] | None = None,
    user_input: str | None = None,
) -> dict[str, object]:
    import asyncio

    return asyncio.run(_main_async(booking_state, booking_draft, pg_url, user_input))
