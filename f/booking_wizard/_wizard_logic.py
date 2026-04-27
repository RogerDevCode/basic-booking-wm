from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any, Final, cast

from ..internal._result import DBClient, Result, fail, ok

if TYPE_CHECKING:
    from ._wizard_models import StepView, WizardState

# Constants
START_HOUR: Final[int] = 8
END_HOUR: Final[int] = 18


class DateUtils:
    @staticmethod
    def format_es(date_str: str) -> str:
        dt = date.fromisoformat(date_str)
        days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
        months = [
            "Enero",
            "Febrero",
            "Marzo",
            "Abril",
            "Mayo",
            "Junio",
            "Julio",
            "Agosto",
            "Septiembre",
            "Octubre",
            "Noviembre",
            "Diciembre",
        ]
        return f"{days[dt.weekday()]}, {dt.day} de {months[dt.month - 1]}"

    @staticmethod
    def get_week_dates(offset: int) -> list[dict[str, str]]:
        dates = []
        today = date.today() + timedelta(days=offset)
        days_es = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
        months_es = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

        for i in range(7):
            d = today + timedelta(days=i)
            dates.append(
                {"date": d.isoformat(), "label": f"{d.day} {months_es[d.month - 1]}", "dayName": days_es[d.weekday()]}
            )
        return dates

    @staticmethod
    def generate_time_slots(start_h: int, end_h: int, duration_min: int) -> list[str]:
        slots = []
        for h in range(start_h, end_h):
            for m in range(0, 60, duration_min):
                slots.append(f"{h:02d}:{m:02d}")
        return slots


class WizardUI:
    @staticmethod
    def build_date_selection(state: WizardState, week_offset: int = 0) -> StepView:
        dates = DateUtils.get_week_dates(week_offset)
        keyboard: list[list[str]] = []
        for i in range(0, len(dates), 2):
            row = [f"{d['dayName']} {d['label']}" for d in dates[i : i + 2]]
            keyboard.append(row)

        nav = ["Semana siguiente »"]
        if week_offset > 0:
            nav.insert(0, "« Semana anterior")
        keyboard.append(nav)
        keyboard.append(["❌ Cancelar"])

        return {
            "message": "📅 *Elige una fecha*\n\n(Toca el día que prefieras)",
            "reply_keyboard": keyboard,
            "new_state": state.model_copy(update={"step": 1}),
            "force_reply": False,
            "reply_placeholder": "",
        }

    @staticmethod
    def build_time_selection(state: WizardState, slots: list[str]) -> StepView:
        keyboard: list[list[str]] = []
        for i in range(0, len(slots), 3):
            keyboard.append(slots[i : i + 3])
        keyboard.append(["« Volver a fechas", "❌ Cancelar"])

        date_label = DateUtils.format_es(state.selected_date) if state.selected_date else "fecha"
        return {
            "message": f"🕐 *Elige un horario*\n\nPara el {date_label}:",
            "reply_keyboard": keyboard,
            "new_state": state.model_copy(update={"step": 2}),
            "force_reply": False,
            "reply_placeholder": "",
        }

    @staticmethod
    def build_confirmation(state: WizardState, provider_name: str, service_name: str) -> StepView:
        date_label = DateUtils.format_es(state.selected_date) if state.selected_date else "?"
        return {
            "message": f"✅ *Confirma tu cita*\n\n📅 Fecha: {date_label}\n🕐 Hora: {state.selected_time}\n👨‍⚕️ Doctor: {provider_name}\n📋 Servicio: {service_name}\n\n¿Confirmas estos detalles?",  # noqa: E501
            "reply_keyboard": [["✅ Confirmar", "🔄 Cambiar hora"], ["« Volver a fechas", "❌ Cancelar"]],
            "new_state": state.model_copy(update={"step": 3}),
            "force_reply": False,
            "reply_placeholder": "",
        }


class WizardRepository:
    def __init__(self, db: DBClient) -> None:
        self.db = db

    async def get_service_duration(self, service_id: str) -> Result[int]:
        rows = await self.db.fetch(
            "SELECT duration_minutes FROM services WHERE service_id = $1::uuid AND is_active = true LIMIT 1", service_id
        )
        if not rows:
            return fail(f"service_not_found: {service_id}")
        return ok(int(cast("Any", rows[0]["duration_minutes"])))

    async def get_available_slots(self, provider_id: str, date_str: str, duration_min: int) -> Result[list[str]]:
        rows = await self.db.fetch(
            """
            SELECT start_time FROM bookings
            WHERE provider_id = $1::uuid
              AND start_time::date = $2::date
              AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
            """,
            provider_id,
            date_str,
        )
        booked_times = set()
        for r in rows:
            st = r["start_time"]
            if isinstance(st, str):
                st_dt = datetime.fromisoformat(st.replace("Z", "+00:00"))
            else:
                st_dt = cast("datetime", st)
            booked_times.add(f"{st_dt.hour:02d}:{st_dt.minute:02d}")

        all_slots = DateUtils.generate_time_slots(START_HOUR, END_HOUR, duration_min)
        available = [s for s in all_slots if s not in booked_times]
        return ok(available)

    async def get_names(self, provider_id: str, service_id: str) -> Result[dict[str, str]]:
        p = await self.db.fetch("SELECT name FROM providers WHERE provider_id = $1::uuid LIMIT 1", provider_id)
        s = await self.db.fetch("SELECT name FROM services WHERE service_id = $1::uuid LIMIT 1", service_id)
        if not p or not s:
            return fail("integrity_error")
        return ok({"provider": str(p[0]["name"]), "service": str(s[0]["name"])})

    async def create_booking(
        self,
        client_id: str,
        provider_id: str,
        service_id: str,
        date_str: str,
        time_str: str,
        tz: str,
        duration_min: int,
    ) -> Result[str]:
        local_ts = f"{date_str}T{time_str}:00"
        ik = f"wizard-{client_id}-{provider_id}-{service_id}-{date_str}-{time_str}"
        try:
            rows = await self.db.fetch(
                """
                INSERT INTO bookings (
                  client_id, provider_id, service_id, start_time, end_time,
                  status, idempotency_key, gcal_sync_status
                ) VALUES (
                  $1::uuid, $2::uuid, $3::uuid,
                  ($4::timestamp AT TIME ZONE $5),
                  ($4::timestamp AT TIME ZONE $5 + ($6 || ' minutes')::interval),
                  'confirmed', $7, 'pending'
                )
                ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
                RETURNING booking_id
                """,
                client_id,
                provider_id,
                service_id,
                local_ts,
                tz,
                duration_min,
                ik,
            )
            if not rows:
                return fail("insert_failed")
            bid = str(rows[0]["booking_id"])

            await self.db.execute(
                """
                INSERT INTO booking_audit (booking_id, from_status, to_status, changed_by, actor_id, reason, metadata)
                VALUES ($1::uuid, null, 'confirmed', 'client', $2::uuid, 'Booking created via wizard', '{"channel": "telegram"}'::jsonb)  # noqa: E501
                """,  # noqa: E501
                bid,
                client_id,
            )
            return ok(bid)
        except Exception as e:
            return fail(f"create_failed: {e}")
