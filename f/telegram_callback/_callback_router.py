from collections.abc import Callable, Coroutine
from typing import Any

from ..internal._db_client import create_db_client
from ..internal._result import Result, ok, with_tenant_context
from ._callback_logic import confirm_booking, update_booking_status
from ._callback_models import ActionContext, ActionHandler, ActionResult


class ConfirmHandler:
    async def handle(self, context: ActionContext) -> Result[ActionResult]:
        conn = await create_db_client()
        try:

            async def operation() -> Result[bool]:
                return await confirm_booking(conn, context["booking_id"], context["client_id"])

            err, success = await with_tenant_context(conn, context["tenantId"], operation)

            if err:
                return ok(
                    {
                        "responseText": "❌ No se pudo confirmar",
                        "followUpText": "No pudimos confirmar tu cita. Motivo: error interno. Contacta a soporte si necesitas ayuda.",  # noqa: E501
                    }
                )
            elif success:
                return ok(
                    {"responseText": "✅ Cita confirmada", "followUpText": "Tu cita ha sido confirmada. ¡Te esperamos!"}
                )
            else:
                return ok(
                    {
                        "responseText": "❌ No se pudo confirmar",
                        "followUpText": "No pudimos confirmar tu cita. La cita no existe o ya fue modificada. Contacta a soporte.",  # noqa: E501
                    }
                )
        finally:
            await conn.close()


class CancelHandler:
    async def handle(self, context: ActionContext) -> Result[ActionResult]:
        conn = await create_db_client()
        try:

            async def operation() -> Result[bool]:
                return await update_booking_status(
                    conn, context["booking_id"], "cancelled", context["client_id"], "client"
                )

            err, success = await with_tenant_context(conn, context["tenantId"], operation)

            if err:
                return ok(
                    {
                        "responseText": "❌ No se pudo cancelar",
                        "followUpText": "No pudimos cancelar tu cita. Motivo: error interno. Contacta a soporte si necesitas ayuda.",  # noqa: E501
                    }
                )
            elif success:
                return ok(
                    {
                        "responseText": "✅ Cita cancelada",
                        "followUpText": 'Tu cita ha sido cancelada exitosamente. Si deseas reagendar, escribe "quiero agendar una cita".',  # noqa: E501
                    }
                )
            else:
                return ok(
                    {
                        "responseText": "❌ No se pudo cancelar",
                        "followUpText": "No pudimos cancelar tu cita. La cita no existe o ya fue modificada. Contacta a soporte.",  # noqa: E501
                    }
                )
        finally:
            await conn.close()


class AcknowledgeHandler:
    async def handle(self, context: ActionContext) -> Result[ActionResult]:
        return ok({"responseText": "Entendido", "followUpText": None})


class AutoRescheduleHandler:
    def __init__(self, book_reschedule: Callable[..., Coroutine[Any, Any, Any]]) -> None:
        self.book_reschedule = book_reschedule

    async def handle(self, context: ActionContext) -> Result[ActionResult]:
        booking_id = context["booking_id"]
        date = context.get("date")
        time = context.get("time")

        if not date or not time:
            return ok(
                {
                    "responseText": "\u26a0\ufe0f Error de datos",
                    "followUpText": "No se pudo obtener la nueva fecha/hora para reagendar. Intenta manualmente.",
                }
            )

        args: dict[str, object] = {
            "booking_id": booking_id,
            "new_start_time": f"{date}T{time}:00",
            "actor": "client",
            "actor_id": context["client_id"],
            "reason": "Auto-reschedule via duplicate booking detection",
            "idempotency_key": f"cb-ars-{booking_id}-{date}-{time}",
        }

        try:
            result = await self.book_reschedule(args=args)
            err = None
            if isinstance(result, dict) and "error" in result:
                err = str(result["error"])
        except Exception as e:
            err = str(e)

        if err:
            return ok(
                {
                    "responseText": "\u274c No se pudo reagendar",
                    "followUpText": f"Hubo un problema al reagendar: {err}",
                }
            )

        return ok(
            {
                "responseText": "\u2705 Reagendada con \u00e9xito",
                "followUpText": f"Tu cita ha sido movida al {date} a las {time}.",
            }
        )


class TelegramRouter:
    def __init__(self) -> None:
        self.handlers: dict[str, ActionHandler] = {}

    def register(self, action: str, handler: ActionHandler) -> None:
        self.handlers[action] = handler

    async def route(self, action: str, context: ActionContext) -> Result[ActionResult]:
        handler = self.handlers.get(action)
        if not handler:
            return ok({"responseText": "⚠️ Acción no reconocida", "followUpText": None})
        return await handler.handle(context)
