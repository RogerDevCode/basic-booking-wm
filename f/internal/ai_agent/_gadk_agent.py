from __future__ import annotations

import json
import os
from typing import Any, Final

from google.adk import Agent, Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from ._constants import INTENT

MODULE: Final[str] = "gadk_agent"


def _clasificar_intent(
    intent: str,
    confianza: float,
    especialidad: str | None = None,
    fecha: str | None = None,
    hora: str | None = None,
    booking_id: str | None = None,
    doctor: str | None = None,
    pregunta: str | None = None,
    es_urgente: bool = False,
) -> str:
    """Clasifica la intencion del usuario y extrae entidades relevantes."""
    entidades: dict[str, str | None | bool] = {
        "especialidad": especialidad,
        "fecha": fecha,
        "hora": hora,
        "booking_id": booking_id,
        "doctor": doctor,
        "pregunta": pregunta,
        "es_urgente": es_urgente,
    }
    return json.dumps(
        {
            "intent": intent,
            "confianza": confianza,
            "entidades": entidades,
        }
    )


_INSTRUCTION: Final[str] = (
    "Eres un clasificador de intenciones para un sistema de reservas medicas por Telegram. "
    "Tu unica tarea es analizar el mensaje del usuario y llamar a la herramienta "
    "`clasificar_intent` con los parametros correctos.\n\n"
    "INTENTS POSIBLES:\n"
    "- crear_cita: El usuario quiere agendar/reservar una hora medica.\n"
    "- cancelar_cita: El usuario quiere cancelar una cita existente.\n"
    "- reagendar_cita: El usuario quiere cambiar la fecha/hora de una cita.\n"
    "- ver_disponibilidad: El usuario pregunta por horarios disponibles.\n"
    "- ver_mis_citas: El usuario quiere ver sus citas agendadas.\n"
    "- ver_mis_datos: El usuario quiere ver/editar sus datos personales.\n"
    "- activar_recordatorios: El usuario quiere configurar recordatorios.\n"
    "- mostrar_menu_principal: El usuario quiere ver el menu (dice 'menu', 'inicio', o digito sin contexto).\n"
    "- saludo: El usuario saluda (hola, buenos dias, buenas).\n"
    "- despedida: El usuario se despide (chao, adios, hasta luego).\n"
    "- agradecimiento: El usuario agradece (gracias, muchas gracias).\n"
    "- urgencia: El usuario indica una emergencia medica urgente.\n"
    "- pregunta_general: El usuario hace una pregunta no relacionada con booking.\n"
    "- desconocido: No puedes determinar la intencion.\n\n"
    "REGLAS:\n"
    "1. SIEMPRE llama a clasificar_intent, nunca respondas con texto libre.\n"
    "2. Extrae entidades del texto: especialidad, fecha, hora, doctor, booking_id.\n"
    "3. Si el usuario menciona urgencia medica, usa intent='urgencia' y es_urgente=True.\n"
    "4. Si es un saludo/despedida/agradecimiento simple, confianza=0.95.\n"
    "5. Si hay ambiguedad, confianza=0.5. Si estas seguro, confianza=0.9.\n"
    "6. Para pregunta_general, incluye el texto de la pregunta en el parametro 'pregunta'.\n"
    "7. Responde en espanol si necesitas hablar, pero tu trabajo principal es llamar al tool."
)

_agent_cache: Agent | None = None
_runner_cache: Runner | None = None


def _get_agent() -> Agent:
    global _agent_cache
    if _agent_cache is None:
        _agent_cache = Agent(
            name="booking_classifier",
            model="gemini-2.5-flash",
            instruction=_INSTRUCTION,
            tools=[_clasificar_intent],
        )
    return _agent_cache


def _get_runner() -> Runner:
    global _runner_cache
    if _runner_cache is None:
        session_service = InMemorySessionService()  # type: ignore[no-untyped-call]
        _runner_cache = Runner(
            agent=_get_agent(),
            app_name="booking_classifier",
            session_service=session_service,
            auto_create_session=True,
        )
    return _runner_cache


async def classify_with_gadk(text: str, chat_id: str) -> dict[str, Any] | None:
    """Clasifica intencion usando Google ADK.

    Returns dict with intent, confidence, entities or None if failed.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None

    os.environ["GOOGLE_API_KEY"] = api_key

    runner = _get_runner()
    content = types.Content(role="user", parts=[types.Part(text=text)])

    try:
        async for event in runner.run_async(
            user_id=chat_id,
            session_id=f"session_{chat_id}",
            new_message=content,
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text and not getattr(part, "thought", False):
                        try:
                            result = json.loads(part.text)
                            return {
                                "intent": result.get("intent", INTENT["DESCONOCIDO"]),
                                "confidence": float(result.get("confianza", 0.0)),
                                "entities": result.get("entidades", {}),
                            }
                        except (json.JSONDecodeError, ValueError):
                            return None
    except Exception:
        return None

    return None
