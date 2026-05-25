#!/bin/bash
# Script de ejecución local para el Gateway de Telegram (FastAPI + Arq Worker)

export PORT="${PORT:-8000}"
export HOST="${HOST:-127.0.0.1}"

# Cargar variables de entorno locales si existen
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

usage() {
  echo "Uso: $0 [api|worker]"
  echo "  api    : Inicia el servidor FastAPI de webhook de Telegram (puerto $PORT)"
  echo "  worker : Inicia el procesador de tareas asíncronas de Arq"
  exit 1
}

if [ -z "$1" ]; then
  usage
fi

case "$1" in
  api)
    echo "🚀 Iniciando API Gateway en http://$HOST:$PORT..."
    uv run uvicorn f.telegram_gateway.app:app --host "$HOST" --port "$PORT" --reload
    ;;
  worker)
    echo "⚙️ Iniciando Arq Worker para procesar eventos..."
    uv run arq f.telegram_gateway.worker.WorkerSettings
    ;;
  *)
    usage
    ;;
esac
