# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "google-adk[extensions]>=2.0.0",
#   "google-genai>=1.75.0",
#   "litellm>=1.71.2",
# ]
# ///
from __future__ import annotations

import json
import os
import time
import traceback
from typing import Any, Final

from google.adk import Agent, Runner
from google.adk.models.lite_llm import LiteLlm
from google.adk.sessions import InMemorySessionService
from google.genai import types

from .._wmill_adapter import log
from ._constants import GADK_APP_NAME, GADK_MODEL, GADK_MODEL_DISPLAY, INTENT

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
    """Clasifica la intencion del usuario y extrae entidades de su mensaje.

    Usa esta herramienta PARA CADA MENSAJE del usuario que no sea una solicitud
    directa de agendar cita. Si el usuario dice frases como 'quiero cita',
    'quiero una hora', 'quiero agendar', 'necesito reservar', NO uses esta
    herramienta; en su lugar llama a `_navegar_a_agendar`.

    Args:
        intent: Identificador de la intencion detectada. Valores validos:
            'crear_cita', 'cancelar_cita', 'reagendar_cita', 'ver_disponibilidad',
            'ver_mis_citas', 'ver_mis_datos', 'activar_recordatorios',
            'mostrar_menu_principal', 'saludo', 'despedida', 'agradecimiento',
            'urgencia', 'pregunta_general', 'desconocido'.
        confianza: Nivel de certeza entre 0.0 y 1.0. Usa 0.95 para saludos/
            despedidas simples, 0.9 cuando estes seguro, 0.5 si hay ambiguedad.
        especialidad: Especialidad medica mencionada (ej: 'cardiologia',
            'dermatologia'). None si no se menciona.
        fecha: Fecha mencionada por el usuario en formato libre (ej: 'viernes',
            '2026-05-25', 'el lunes'). None si no se menciona.
        hora: Hora mencionada (ej: '10:00', 'por la manana'). None si no aplica.
        booking_id: ID de una cita existente cuando el usuario se refiere a ella
            (ej: 'cancela mi cita del martes'). None si no aplica.
        doctor: Nombre del profesional medico mencionado (ej: 'doctor Garcia',
            'cardiologo'). None si no se menciona.
        pregunta: Texto completo de la pregunta cuando el intent es
            'pregunta_general'. None para otros intents.
        es_urgente: True cuando el usuario indica una emergencia medica que
            requiere atencion inmediata. False en todos los demas casos.

    Returns:
        str: JSON serializado con la estructura:
            {"intent": str, "confianza": float, "entidades": dict}.
            El sistema parsea este JSON para decidir el siguiente paso del flow.
    """
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


def _navegar_a_agendar(
    especialidad: str | None = None,
    fecha: str | None = None,
    doctor: str | None = None,
) -> str:
    """Inicia el flujo de agendamiento de cita medica en el sistema.

    Usa esta herramienta EXCLUSIVAMENTE cuando el usuario exprese de forma
    clara su deseo de agendar una cita medica. Frases tipicas que activan
    esta herramienta: 'quiero cita', 'quiero una hora', 'quiero agendar',
    'necesito reservar', 'agendar con el cardiologo', 'hora para el viernes'.

    NO uses esta herramienta para: consultas de citas existentes, cancelaciones,
    preguntas generales, saludos, o cualquier otra intencion que no sea crear
    una nueva cita. En esos casos usa `_clasificar_intent`.

    Args:
        especialidad: Especialidad medica solicitada si el usuario la menciona
            explicitamente (ej: 'cardiologia', 'pediatria', 'odontologia').
            None si el usuario no especifica o dice 'cualquier especialidad'.
        fecha: Fecha preferida en formato libre si el usuario la menciona
            (ej: 'viernes', '2026-05-25', 'la proxima semana', 'el lunes').
            None si el usuario no indica preferencia de fecha.
        doctor: Nombre del profesional medico si el usuario lo solicita
            explicitamente (ej: 'doctor Martinez', 'la doctora Lopez').
            None si el usuario no especifica doctor.

    Returns:
        str: JSON serializado con la estructura:
            {"accion": "iniciar_agendamiento", "especialidad": str|None,
             "fecha": str|None, "doctor": str|None}.
            El sistema lee este JSON e inicia el FSM de booking en el estado
            correspondiente, saltando pasos si se proporcionaron entidades.
    """
    return json.dumps(
        {
            "accion": "iniciar_agendamiento",
            "especialidad": especialidad,
            "fecha": fecha,
            "doctor": doctor,
        }
    )


_INSTRUCTION: Final[str] = (
    "Eres un clasificador de intenciones para un sistema de reservas medicas por Telegram. "
    "Tu unica tarea es analizar el mensaje del usuario y llamar a la herramienta correcta.\n\n"
    "HERRAMIENTAS DISPONIBLES:\n"
    "1. `_navegar_a_agendar`: USALA SOLO cuando el usuario quiere agendar una cita nueva.\n"
    "   Frases clave: 'quiero cita', 'quiero una hora', 'quiero agendar', 'necesito reservar'.\n"
    "2. `_clasificar_intent`: USALA para TODO lo demas (cancelar, ver citas, saludo, etc).\n\n"
    "INTENTS POSIBLES (para _clasificar_intent):\n"
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
    "1. SI el usuario quiere agendar cita → llama a `_navegar_a_agendar`.\n"
    "2. PARA cualquier otra intencion → llama a `_clasificar_intent`.\n"
    "3. NUNCA respondas con texto libre, SIEMPRE llama a una herramienta.\n"
    "4. Extrae entidades del texto: especialidad, fecha, hora, doctor, booking_id.\n"
    "5. Si el usuario menciona urgencia medica, usa intent='urgencia' y es_urgente=True.\n"
    "6. Si es un saludo/despedida/agradecimiento simple, confianza=0.95.\n"
    "7. Si hay ambiguedad, confianza=0.5. Si estas seguro, confianza=0.9.\n"
    "8. Para pregunta_general, incluye el texto de la pregunta en el parametro 'pregunta'."
)

_agent_cache: Agent | None = None
_runner_cache: Runner | None = None


def _get_agent() -> Agent:
    global _agent_cache
    if _agent_cache is None:
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        _agent_cache = Agent(
            name=f"booking_classifier_{int(time.time())}",
            model=LiteLlm(model=GADK_MODEL, api_key=openrouter_key),
            instruction=_INSTRUCTION,
            tools=[_navegar_a_agendar, _clasificar_intent],
        )
    return _agent_cache


def _get_runner() -> Runner:
    global _runner_cache
    if _runner_cache is None:
        session_service = InMemorySessionService()  # type: ignore[no-untyped-call]
        _runner_cache = Runner(
            agent=_get_agent(),
            app_name=GADK_APP_NAME,
            session_service=session_service,
            auto_create_session=True,
        )
    return _runner_cache


async def classify_with_gadk(text: str, chat_id: str) -> dict[str, Any] | None:
    """Clasifica intencion usando Google ADK + LiteLlm + OpenRouter (Nemotron 3 Super).

    Returns dict with intent, confidence, entities or None if failed.
    """
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        log("GADK_NO_OPENROUTER_KEY", module=MODULE)
        return None

    log(f"GADK_START | model={GADK_MODEL_DISPLAY} | text={text[:50]}", module=MODULE)

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
                            # Check if it's a navigate_to_booking response
                            if result.get("accion") == "iniciar_agendamiento":
                                return {
                                    "intent": INTENT["CREAR_CITA"],
                                    "confidence": 0.95,
                                    "entities": {
                                        "especialidad": result.get("especialidad"),
                                        "fecha": result.get("fecha"),
                                        "hora": None,
                                        "doctor": result.get("doctor"),
                                        "booking_id": None,
                                        "pregunta": None,
                                        "es_urgente": False,
                                    },
                                    "navigate_to_booking": True,
                                }
                            return {
                                "intent": result.get("intent", INTENT["DESCONOCIDO"]),
                                "confidence": float(result.get("confianza", 0.0)),
                                "entities": result.get("entidades", {}),
                            }
                        except (json.JSONDecodeError, ValueError) as e:
                            log(f"GADK_JSON_ERROR | error={e}", module=MODULE)
                            return None
                    if hasattr(part, "function_call") and part.function_call:
                        fc = part.function_call
                        try:
                            raw_args = fc.args if fc.args else "{}"
                            args: dict[str, Any] = (
                                json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                            )
                            # Handle _navegar_a_agendar tool call
                            if fc.name == "_navegar_a_agendar":
                                return {
                                    "intent": INTENT["CREAR_CITA"],
                                    "confidence": 0.95,
                                    "entities": {
                                        "especialidad": args.get("especialidad"),
                                        "fecha": args.get("fecha"),
                                        "hora": None,
                                        "doctor": args.get("doctor"),
                                        "booking_id": None,
                                        "pregunta": None,
                                        "es_urgente": False,
                                    },
                                    "navigate_to_booking": True,
                                }
                            # Handle _clasificar_intent tool call
                            return {
                                "intent": args.get("intent", INTENT["DESCONOCIDO"]),
                                "confidence": float(args.get("confianza", 0.0)),
                                "entities": {
                                    "especialidad": args.get("especialidad"),
                                    "fecha": args.get("fecha"),
                                    "hora": args.get("hora"),
                                    "doctor": args.get("doctor"),
                                    "booking_id": args.get("booking_id"),
                                    "pregunta": args.get("pregunta"),
                                    "es_urgente": args.get("es_urgente", False),
                                },
                            }
                        except (json.JSONDecodeError, ValueError, TypeError) as e:
                            log(f"GADK_TOOL_ARGS_ERROR | error={e}", module=MODULE)
                            return None
    except Exception as e:
        tb = traceback.format_exc()
        log(f"GADK_EXCEPTION | error={e} | traceback={tb}", module=MODULE)
        return None

    return None
