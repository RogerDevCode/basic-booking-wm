import traceback
from datetime import datetime

from ..internal._db_client import create_db_client
from ..internal._result import with_tenant_context
from ..internal._wmill_adapter import log
from ..services.booking._booking_models import BookingCancelRequest, BookingRescheduleRequest, BookingResult
from ..services.booking.core import cancel_booking, reschedule_booking
from ..services.booking.repo import PgBookingRepo
from ._callback_logic import confirm_booking
from ._callback_models import ActionContext, ActionHandler, ActionResult


class ConfirmHandler:
    async def handle(self, context: ActionContext) -> ActionResult:
        # Legacy/edge-case: bookings are now created as confirmed by default.
        conn = await create_db_client()
        try:

            async def operation() -> bool:
                return await confirm_booking(conn, context["booking_id"], context["client_id"])

            success = await with_tenant_context(conn, context["tenantId"], operation)

            if not success:
                return {
                    "responseText": "❌ No se pudo confirmar",
                    "followUpText": "No pudimos confirmar tu cita. Motivo: error interno. Contacta a soporte si necesitas ayuda.",  # noqa: E501
                }
            elif success:
                return {
                    "responseText": "✅ Cita confirmada",
                    "followUpText": "Tu cita ha sido confirmada. ¡Te esperamos!",
                }
            else:
                return {
                    "responseText": "❌ No se pudo confirmar",
                    "followUpText": "No pudimos confirmar tu cita. La cita no existe o ya fue modificada. Contacta a soporte.",  # noqa: E501
                }
        finally:
            await conn.close()


class CancelHandler:
    async def handle(self, context: ActionContext) -> ActionResult:
        # Instead of cancelling immediately, show reasons
        booking_id = context["booking_id"]
        sid = context.get("session_id")
        suffix = f"|{sid}" if sid else ""
        return {
            "responseText": "¿Por qué deseas cancelar tu cita? 🧐",
            "followUpText": None,
            "inlineButtons": [
                [{"text": "📅 Cambiar de fecha/hora", "callback_data": f"cxr:{booking_id}:CH{suffix}"}],
                [{"text": "🚨 Emergencia personal", "callback_data": f"cxr:{booking_id}:EM{suffix}"}],
                [{"text": "❌ Ya no lo necesito", "callback_data": f"cxr:{booking_id}:NN{suffix}"}],
                [{"text": "✏️ Error al agendar", "callback_data": f"cxr:{booking_id}:ER{suffix}"}],
            ],
        }


class CancelReasonHandler:
    async def handle(self, context: ActionContext) -> ActionResult:
        reason_code = context.get("reason_code") or "ER"
        reason_map = {
            "CH": "Cambio de fecha/hora",
            "EM": "Emergencia personal",
            "NN": "Ya no lo necesito",
            "ER": "Error al agendar",
        }
        reason_text = reason_map.get(reason_code, "Otro")

        conn = await create_db_client()
        try:
            repo = PgBookingRepo(conn)
            req = BookingCancelRequest(
                booking_id=context["booking_id"],
                actor="client",
                actor_id=context["client_id"],
                reason=f"Motivo: {reason_text}",
            )

            async def operation_cancel() -> BookingResult:
                return await cancel_booking(req, repo)

            await with_tenant_context(conn, context["tenantId"], operation_cancel)

            follow_up = f"Tu cita ha sido cancelada (Motivo: {reason_text})."
            if reason_code == "CH":
                follow_up += "\n\n🔄 ¿Te gustaría agendar una nueva hora ahora mismo?"

            sid = context.get("session_id")
            suffix = f"|{sid}" if sid else ""
            res_obj: ActionResult = {
                "responseText": "✅ Cita cancelada",
                "followUpText": follow_up,
            }
            if reason_code == "CH":
                res_obj["inlineButtons"] = [
                    [{"text": "📅 Agendar nueva hora", "callback_data": f"cmd:agendar{suffix}"}]
                ]
            return res_obj
        except Exception as e:
            log("CANCEL_REASON_CALLBACK_FAILED", error=str(e), traceback=traceback.format_exc(), module="callback_router")
            return {
                "responseText": "❌ No se pudo cancelar",
                "followUpText": "No pudimos procesar la cancelación. Contacta a soporte.",
            }
        finally:
            await conn.close()


class AcknowledgeHandler:
    async def handle(self, context: ActionContext) -> ActionResult:
        return {"responseText": "Entendido", "followUpText": None}


class AutoRescheduleHandler:
    async def handle(self, context: ActionContext) -> ActionResult:
        booking_id = context["booking_id"]
        date = context.get("date")
        time = context.get("time")

        if not date or not time:
            return {
                "responseText": "⚠️ Error de datos",
                "followUpText": "No se pudo obtener la nueva fecha/hora para reagendar. Intenta manualmente.",
            }

        conn = await create_db_client()
        try:
            repo = PgBookingRepo(conn)

            # Note: The original logic didn't provide end_time.
            # We assume a 30 min default duration here, ideally it should fetch service duration.
            start_dt = datetime.fromisoformat(f"{date}T{time}:00".replace("Z", "+00:00"))
            import datetime as dt

            end_dt = start_dt + dt.timedelta(minutes=30)

            req = BookingRescheduleRequest(
                booking_id=booking_id,
                new_start_time=start_dt,
                new_end_time=end_dt,
                actor="client",
                actor_id=context["client_id"],
            )

            async def operation_reschedule() -> BookingResult:
                return await reschedule_booking(req, repo)

            await with_tenant_context(conn, context["tenantId"], operation_reschedule)
            err = None
        except Exception as e:
            log(
                "AUTORESCHEDULE_CALLBACK_FAILED",
                error=str(e),
                traceback=traceback.format_exc(),
                module="callback_router",
            )
            err = str(e)
        finally:
            await conn.close()

        if err:
            return {
                "responseText": "❌ No se pudo reagendar",
                "followUpText": f"Hubo un problema al reagendar: {err}",
            }

        return {
            "responseText": "✅ Reagendada con éxito",
            "followUpText": f"Tu cita ha sido movida al {date} a las {time}.",
        }


class TelegramRouter:
    def __init__(self) -> None:
        self.handlers: dict[str, ActionHandler] = {}

    def register(self, action: str, handler: ActionHandler) -> None:
        self.handlers[action] = handler

    async def route(self, action: str, context: ActionContext) -> ActionResult:
        handler = self.handlers.get(action)
        if not handler:
            return {"responseText": "⚠️ Acción no reconocida", "followUpText": None}
        return await handler.handle(context)
