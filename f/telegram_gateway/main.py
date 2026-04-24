# ============================================================================
# PRE-FLIGHT CHECKLIST
# Mission         : Main webhook handler for Telegram messages
# DB Tables Used  : clients
# Concurrency Risk: NO
# GCal Calls      : NO
# Idempotency Key : N/A
# RLS Tenant ID   : NO — registration is global
# Pydantic Schemas: YES — TelegramUpdate validation
# ============================================================================

import os
from typing import Any, Dict, Optional, Tuple, cast
from ..internal._wmill_adapter import log, get_variable
from ..internal._result import Result, ok, fail
from ._gateway_models import TelegramUpdate, TelegramMessage, TelegramCallback, SendMessageOptions
from ._gateway_logic import TelegramClient, ClientRepository

MODULE = "telegram_gateway"

class TelegramRouter:
    def __init__(self, telegram: TelegramClient, repository: ClientRepository):
        self.telegram = telegram
        self.repository = repository

    async def route_update(self, update: TelegramUpdate) -> Result[str]:
        if update.callback_query:
            return await self.handle_callback(update.callback_query)
        if update.message:
            return await self.handle_message(update.message)
        return fail("unsupported_update_type")

    async def handle_callback(self, query: TelegramCallback) -> Result[str]:
        data = query.data
        parts = data.split(':')
        if len(parts) < 2:
            return ok(f"callback_handled:{data}")
        
        category, action = parts[0], parts[1]
        if category == 'cmd': return ok(f"flow_triggered:{action}")
        if category == 'admin': return ok(f"admin_action:{action}")
        if category == 'provider': return ok(f"provider_action:{action}")
        
        return ok(f"callback_handled:{data}")

    async def handle_message(self, message: TelegramMessage) -> Result[str]:
        text = (message.text or "").strip()
        chat_id = str(message.chat.id)
        
        f_name = message.from_user.first_name if message.from_user else "Usuario"
        l_name = message.from_user.last_name if message.from_user else ""
        full_name = f"{f_name} {l_name}".strip()

        # Registration
        err_reg, _ = await self.repository.ensure_registered(full_name)
        if err_reg:
            log(f"Registration warning: {err_reg}", module=MODULE)

        if text == '/start':
            return await self.send_start_menu(chat_id, f_name)
        elif text == '/admin':
            return await self.send_admin_menu(chat_id)
        elif text == '/provider':
            return await self.send_provider_menu(chat_id)
        
        if not text: return fail("empty_message")
        return await self.send_help(chat_id)

    async def send_start_menu(self, chat_id: str, first_name: str) -> Result[str]:
        welcome = f"👋 ¡Hola {first_name}! Bienvenido a *AutoAgenda*.\n\n" \
                  "Soy tu asistente de agendamiento médico. ¿Qué necesitas?\n\n" \
                  "📋 *Opciones disponibles:*\n" \
                  "• *Agendar cita* → Escribe \"quiero agendar\"\n" \
                  "• *Ver mis citas* → Escribe \"mis citas\"\n" \
                  "• *Cancelar cita* → Escribe \"cancelar\"\n" \
                  "• *Reagendar* → Escribe \"reagendar\""
        
        opts = SendMessageOptions(reply_markup={
            "inline_keyboard": [
                [{"text": '📅 Agendar Cita', "callback_data": 'cmd:book'}],
                [{"text": '📋 Mis Citas', "callback_data": 'cmd:mybookings'}],
                [{"text": '❌ Cancelar', "callback_data": 'cmd:cancel'}]
            ]
        })
        err, _ = await self.telegram.send_message(chat_id, welcome, opts)
        return ok("welcome_sent") if not err else fail(err)

    async def send_admin_menu(self, chat_id: str) -> Result[str]:
        text = "🔐 *Panel de Administrador*\n\nSelecciona una acción:"
        opts = SendMessageOptions(reply_markup={
            "inline_keyboard": [
                [{"text": '👨‍⚕️ Crear Provider', "callback_data": 'admin:create_provider'}],
                [{"text": '📊 Especialidades', "callback_data": 'admin:specialties'}]
            ]
        })
        err, _ = await self.telegram.send_message(chat_id, text, opts)
        return ok("admin_menu_sent") if not err else fail(err)

    async def send_provider_menu(self, chat_id: str) -> Result[str]:
        text = "🩺 *Panel del Provider*\n\nSelecciona una acción:"
        opts = SendMessageOptions(reply_markup={
            "inline_keyboard": [
                [{"text": '📅 Mi Agenda', "callback_data": 'provider:agenda'}],
                [{"text": '📝 Notas Clínicas', "callback_data": 'provider:notes'}]
            ]
        })
        err, _ = await self.telegram.send_message(chat_id, text, opts)
        return ok("provider_menu_sent") if not err else fail(err)

    async def send_help(self, chat_id: str) -> Result[str]:
        text = "🤔 No entendí tu mensaje.\n\n" \
               "Puedes ayudarte con:\n" \
               "• */start* → Menú principal\n" \
               "• */admin* → Panel administrador\n" \
               "• */provider* → Panel provider"
        err, _ = await self.telegram.send_message(chat_id, text)
        return ok("help_sent") if not err else fail(err)

async def main(args: dict[str, Any]) -> Result[Dict[str, str]]:
    try:
        update = TelegramUpdate.model_validate(args)
    except Exception as e:
        return fail(f"validation_error: {e}")

    token = get_variable("TELEGRAM_BOT_TOKEN") or ""
    db_url = os.getenv("DATABASE_URL") or ""
    
    client = TelegramClient(token)
    repo = ClientRepository(db_url)
    router = TelegramRouter(client, repo)

    err, res = await router.route_update(update)
    if err:
        return fail(err)
    
    return ok({"message": res or "ok"})
