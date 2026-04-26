from typing import Any
import json
from typing import Dict, Any, List, Optional, Tuple, cast
from ..internal._result import Result, DBClient, ok, fail
from ._config_models import ReminderPrefs

DEFAULTS: ReminderPrefs = {
    "telegram_24h": True,
    "gmail_24h": True,
    "telegram_2h": True,
    "telegram_30min": True,
}

async def load_preferences(db: DBClient, client_id: str) -> ReminderPrefs:
    try:
        rows = await db.fetch("SELECT metadata FROM clients WHERE client_id = $1::uuid LIMIT 1", client_id)
        if not rows or not rows[0].get("metadata"):
            return DEFAULTS.copy()

        meta = rows[0]["metadata"]
        if isinstance(meta, str): meta = json.loads(meta)
        
        raw_prefs = meta.get("reminder_preferences", {})
        if not isinstance(raw_prefs, dict):
            return DEFAULTS.copy()

        return {
            "telegram_24h": bool(raw_prefs.get("telegram_24h", True)),
            "gmail_24h": bool(raw_prefs.get("gmail_24h", True)),
            "telegram_2h": bool(raw_prefs.get("telegram_2h", True)),
            "telegram_30min": bool(raw_prefs.get("telegram_30min", True)),
        }
    except Exception as e:
        from ..internal._wmill_adapter import log
        log("SILENT_ERROR_CAUGHT", error=str(e), file="_config_logic.py")
        return DEFAULTS.copy()

async def save_preferences(db: DBClient, client_id: str, prefs: ReminderPrefs) -> bool:
    try:
        await db.execute(
            """
            UPDATE clients
            SET metadata = jsonb_set(
                  COALESCE(metadata, '{}'::jsonb),
                  '{reminder_preferences}',
                  $1::jsonb
                ),
                updated_at = NOW()
            WHERE client_id = $2::uuid
            """,
            json.dumps(prefs), client_id
        )
        return True
    except Exception as e:
        from ..internal._wmill_adapter import log
        log("SILENT_ERROR_CAUGHT", error=str(e), file="_config_logic.py")
        return False

def build_config_message(p: ReminderPrefs) -> Tuple[str, List[List[str]]]:
    tg_status = "✅" if (p["telegram_24h"] or p["telegram_2h"] or p["telegram_30min"]) else "❌"
    gm_status = "✅" if p["gmail_24h"] else "❌"
    
    msg = f"""⚙️ *Configuración de Recordatorios*

📱 Telegram: {tg_status}
📧 Email: {gm_status}

¿Qué deseas configurar?"""

    kb = [
        [f"{'🔔' if tg_status == '❌' else '🔕'} Telegram", f"{'🔔' if gm_status == '❌' else '🔕'} Email"],
        ["🕒 Ajustar ventanas", "« Volver al menú"]
    ]
    return msg, kb

def build_window_config(p: ReminderPrefs) -> Tuple[str, List[List[str]]]:
    w24 = "✅" if p["telegram_24h"] else "❌"
    w2h = "✅" if p["telegram_2h"] else "❌"
    w30 = "✅" if p["telegram_30min"] else "❌"
    
    msg = f"""🕒 *Ventanas de Aviso (Telegram)*

1️⃣ 24 horas antes: {w24}
2️⃣ 2 horas antes: {w2h}
3️⃣ 30 minutos antes: {w30}

Toca un botón para cambiar:"""

    kb = [
        [f"{w24} 24 horas", f"{w2h} 2 horas"],
        [f"{w30} 30 minutos", "⬅️ Volver"]
    ]
    return msg, kb

def set_all(p: ReminderPrefs, value: bool) -> ReminderPrefs:
    return {
        "telegram_24h": value,
        "gmail_24h": value,
        "telegram_2h": value,
        "telegram_30min": value
    }
