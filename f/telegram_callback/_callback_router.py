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
