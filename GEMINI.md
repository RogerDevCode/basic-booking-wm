# GEMINI.md

## 🏗️ Arquitectura (§PY)

### Split-Monolith (Java-like)
Cada carpeta en `f/` contiene:
- `main.py` -> Entrypoint (validación Pydantic + orquestación).
- `_logic.py` -> Lógica de dominio pura (sin IO).
- `_models.py` -> Schemas y DTOs.
- `_repository.py` -> (Opcional) Capa de acceso a datos SQL.

### Reglas Inviolables
- **No Rais:** Prohibido lanzar excepciones para flujo de negocio; usar `Result[T, E]`.
- **Typing:** `mypy --strict` obligatorio en CI.
- **RLS:** Aislamiento forzado mediante `with_tenant_context`.

lee el archivo AGENTS.md
