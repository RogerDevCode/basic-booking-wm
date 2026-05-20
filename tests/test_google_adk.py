# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "google-adk>=2.0.0",
#   "python-dotenv>=1.0.0",
# ]
# ///
from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv
from google.adk import Agent, Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types


def ejecutar_script_interno(comando: str) -> str:
    """Ejecuta un comando interno y retorna el log de salida."""
    return f"Exito: El pipeline ejecuto el comando '{comando}' correctamente."


def consultar_disponibilidad(fecha: str, especialidad: str) -> str:
    """Consulta disponibilidad de horas para una fecha y especialidad."""
    return f"Disponibilidad para {especialidad} el {fecha}: 09:00, 10:00, 11:30, 14:00, 15:30"


def reservar_hora(fecha: str, hora: str, especialidad: str) -> str:
    """Reserva una hora medica y retorna confirmacion."""
    return f"Reserva confirmada: {especialidad} el {fecha} a las {hora}. Se ha enviado un recordatorio por Telegram."


def cancelar_hora(booking_id: str) -> str:
    """Cancela una reserva existente."""
    return f"Reserva {booking_id} cancelada exitosamente. El horario ha sido liberado."


# MODELO CONFIGURABLE
# Free tier quotas (por minuto/proyecto/modelo):
#   gemini-2.5-flash: 5 RPM, function calling nativo (DEFAULT)
#   gemma-4-31b-it: 15 RPM, pero function calling tiene bug en ADK v2.0
#     (thinking tokens bloquean extraccion de function calls)
ADK_MODEL = os.getenv("ADK_MODEL", "gemini-2.5-flash")

agente_mediador = Agent(
    name="mediador_app",
    model=ADK_MODEL,
    instruction=(
        "Eres el agente mediador central de la aplicacion Python. Tu objetivo es "
        "orquestar peticiones, invocar las herramientas internas provistas cuando "
        "sea necesario y formatear las salidas de forma limpia. "
        "Responde siempre en espanol."
    ),
    tools=[ejecutar_script_interno, consultar_disponibilidad, reservar_hora, cancelar_hora],
)


async def _run_test(
    runner: Runner, user_id: str, session_id: str, query: str, label: str, max_retries: int = 5
) -> None:
    print(f"\n{'=' * 60}")
    print(f"[Test] {label}")
    print(f"[Usuario] {query}")
    print("[Sistema] Enviando solicitud al mediador ADK...")

    content = types.Content(role="user", parts=[types.Part(text=query)])
    final_text: list[str] = []

    for attempt in range(max_retries):
        try:
            async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=content):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text and not getattr(part, "thought", False):
                            final_text.append(part.text)
            break
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "503" in error_str:
                import re

                delay_match = re.search(r"retry in (\d+\.?\d*)s", error_str)
                if delay_match:
                    wait = float(delay_match.group(1)) + 1
                else:
                    wait = min(2**attempt * 3, 30)
                if attempt < max_retries - 1:
                    print(f"[Reintento] {attempt + 1}/{max_retries} - Esperando {wait:.0f}s (rate limit)...")
                    await asyncio.sleep(wait)
                else:
                    print(f"[Error] Cuota agotada despues de {max_retries} intentos. Espera 1 minuto y reintenta.")
                    raise
            else:
                raise

    print("[Respuesta del Agente]:")
    print("\n".join(final_text) if final_text else "(sin respuesta)")
    print(f"{'=' * 60}")


async def _main() -> None:
    load_dotenv()

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY no configurada en .env")

    os.environ["GOOGLE_API_KEY"] = api_key

    print(f"[Google ADK] Modelo: {ADK_MODEL}")
    print("[Google ADK] Iniciando pruebas...")

    session_service = InMemorySessionService()  # type: ignore[no-untyped-call]
    runner = Runner(
        agent=agente_mediador,
        app_name="mediador_app",
        session_service=session_service,
        auto_create_session=True,
    )

    user_id = "test_user"
    session_id = "test_session_1"

    await _run_test(
        runner,
        user_id,
        session_id,
        "Necesito que corras el pipeline interno para actualizar el comando de optimizacion.",
        "Ejecutar script interno",
    )

    await _run_test(
        runner,
        user_id,
        session_id,
        "Quiero agendar una hora con cardiologia para el 25 de mayo.",
        "Consultar disponibilidad y reservar",
    )

    await _run_test(
        runner,
        user_id,
        session_id,
        "Cancela mi reserva con ID BK-20260520-001",
        "Cancelar reserva",
    )

    await _run_test(
        runner,
        user_id,
        session_id,
        "Hola, que puedes hacer?",
        "Saludo / presentacion",
    )


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
