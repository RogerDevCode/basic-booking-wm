#!/usr/bin/env python3
"""
Test script para enviar mensajes simulados de Telegram al flow de Windmill.
Usage:
    export WM_TOKEN="tu_token_aqui"
    export WM_BASE_URL="https://titanium.stax.ink"
    python scripts/test_telegram_flow.py --message "Hola" --chat_id 123456789
"""

from __future__ import annotations

import argparse
import os
import sys

import httpx


def send_telegram_message(
    base_url: str,
    token: str,
    chat_id: int,
    text: str,
    username: str | None = None,
    first_name: str | None = None,
) -> dict[str, object]:
    """Enviar mensaje simulado de Telegram al flow de Windmill."""
    url = f"{base_url}/webhooks/booking-titanium/f/flows/telegram_webhook__flow"

    payload = {
        "update_id": 999999999,
        "message": {
            "message_id": 1,
            "from": {
                "id": chat_id,
                "is_bot": False,
                "first_name": first_name or "Test",
                "last_name": None,
                "username": username,
            },
            "chat": {
                "id": chat_id,
                "type": "private",
            },
            "date": 1700000000,
            "text": text,
        },
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


def main(args: argparse.Namespace) -> None:
    base_url = args.base_url or os.getenv("WM_BASE_URL", "https://titanium.stax.ink")
    token = args.token or os.getenv("WM_TOKEN")

    if not token:
        print("Error: WM_TOKEN no configurado. Establece la variable de entorno o pasa --token")
        sys.exit(1)

    print("Enviando mensaje a Windmill...")
    print(f"  URL: {base_url}/api/flows/w:booking-titanium:f/flows/telegram_webhook__flow/run")
    print(f"  chat_id: {args.chat_id}")
    print(f"  message: {args.message}")
    print()

    try:
        result = send_telegram_message(
            base_url=base_url,
            token=token,
            chat_id=args.chat_id,
            text=args.message,
            username=args.username,
            first_name=args.first_name,
        )
        print("✅ Respuesta del flow:")
        print(result)
    except httpx.HTTPStatusError as e:
        print(f"❌ Error HTTP: {e.response.status_code}")
        print(e.response.text)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test Telegram webhook flow")
    parser.add_argument("--message", "-m", required=True, help="Mensaje a enviar")
    parser.add_argument("--chat-id", type=int, default=5391760292, help="Chat ID de Telegram")
    parser.add_argument("--username", "-u", default=None, help="Username de Telegram")
    parser.add_argument("--first-name", default="TestUser", help="First name")
    parser.add_argument("--token", "-t", default=None, help="Token de Windmill (o usar WM_TOKEN)")
    parser.add_argument("--base-url", default=None, help="URL base de Windmill")
    main(parser.parse_args())
