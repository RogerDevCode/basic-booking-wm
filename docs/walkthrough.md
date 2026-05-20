# Walkthrough: Rediseño y Robustez del Sistema RAG

Hemos reemplazado la búsqueda substring vulnerable `ILIKE` limitada a los primeros 20 caracteres por una consulta robusta de Búsqueda de Texto Completo (FTS) en español con ranking (`ts_rank`) y plegado de acentos (`immutable_unaccent`). Además, regeneramos y actualizamos todos los datos del RAG.

## Cambios Ejecutados

### 1. Robustez en la Recuperación de Contexto RAG
*   [_rag_context.py](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/ai_agent/_rag_context.py):
    *   Reemplazado el filtro simple `content ILIKE f"%{text[:20]}%"` por una consulta FTS.
    *   Uso de `plainto_tsquery('spanish', immutable_unaccent($2))` con la conversión a operador `|` (OR) para maximizar recall de términos claves.
    *   Filtrado exacto de aislamiento de proveedor (`provider_id IS NULL OR provider_id = $1::uuid`) y estado (`is_active = true`).
    *   Ordenamiento prioritario por coincidencia específica del proveedor (`provider_id DESC NULLS LAST`) seguido por score de relevancia semántica (`ts_rank(search_vector, q.query) DESC`).
    *   Se lee el texto completo del mensaje del usuario en lugar de truncarlo a 20 caracteres.

### 2. Sincronización y Regeneración de Datos RAG
*   **Migración Aplicada**: Se ejecutó localmente [019_rag_fts_spanish.sql](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/migrations/019_rag_fts_spanish.sql), creando la columna generada `search_vector` y su respectivo índice GIN.
*   **Semillas de Datos**:
    *   Se cargó [seed_rag_faqs.sql](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/migrations/seed_rag_faqs.sql) para poblar las FAQs globales del sistema.
    *   Se cargó [seed_rag_provider_faqs.sql](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/seed_rag_provider_faqs.sql) para poblar las FAQs específicas de cada uno de los 5 doctores del sistema.
*   **Total de Registros**: Aumentado de 56 a **95 FAQs** activas y correctamente indexadas con sus vectores de búsqueda léxica.

---

## Verificación de Calidad

1.  **Format & Lints**: Ruff limpio.
    ```bash
    uv run ruff check .
    ```
2.  **Type Checks**: Pyright a 0 errores, 0 advertencias.
    ```bash
    uv run pyright .
    ```
3.  **Tests**: 1042 passed.
    ```bash
    uv run pytest -q
    ```
