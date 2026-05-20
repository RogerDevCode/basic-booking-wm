# Implementation Plan: Rediseño y Robustez del Sistema RAG

Reemplazamos el método de búsqueda substring ILIKE (limitado a 20 caracteres) por búsqueda de texto completo (FTS) con ranking y normalización de acentos en español sobre la base de conocimiento (`knowledge_base`). Esto previene fallas silenciosas y garantiza la recuperación correcta de contexto para el agente de IA.

## User Review Required

> [!IMPORTANT]
> - La columna `search_vector` de la tabla `knowledge_base` y la función `immutable_unaccent` ya existen en base de datos.
> - Se utilizará FTS en español con `plainto_tsquery` y reemplazo de `&` por `|` para maximizar el recall (búsqueda de coincidencia de términos) en lugar de requerir que coincidan todas las palabras obligatoriamente.
> - No se requieren cambios de esquema ni dependencias externas adicionales en este hito (M1).

## Proposed Changes

### AI Agent Component

#### [MODIFY] [_rag_context.py](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/ai_agent/_rag_context.py)
- Reemplazar la consulta `ILIKE` por una consulta FTS completa basada en `search_vector`.
- Sanitizar y normalizar la entrada del usuario usando la función `immutable_unaccent` de Postgres.
- Ordenar por relevancia (`ts_rank`) y prioridad de proveedor (`provider_id DESC NULLS LAST`).
- Resolver el límite dinámico (`limit`).

### Verification Plan

### Automated Tests
- Ejecutar la suite de pruebas completa del agente de IA:
  ```bash
  uv run pytest tests/test_ai_agent_logic.py
  uv run pytest tests/test_ai_agent_routing.py
  ```

### Manual Verification
- Probar la función de recuperación localmente con un script scratch para simular preguntas que inician con saludos (ej: `"Hola, ¿atienden Fonasa?"`).
