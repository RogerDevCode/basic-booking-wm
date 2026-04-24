================================================================================
ACTUALIZACIÓN 2025–2026 — LINEAMIENTOS MODERNOS PARA MIGRACIÓN TS → PYTHON
(Windmill + Tipado Go-like + Organización Java-like)
================================================================================

## 1. PRINCIPIOS ACTUALIZADOS (2025–2026)

### 1.1 Tipado estricto real en Python (equivalente moderno a TS strict)

NUEVO ESTÁNDAR (2025+):
- mypy --strict + pyright --strict → obligatorios simultáneamente
- Prohibido uso de Any implícito (mypy: disallow_any_expr recomendado)
- Uso extensivo de:
  - typing.Final
  - typing.TypedDict (para DTO simples)
  - Pydantic v2 (boundary)
  - Protocol (para interfaces estructurales)

AGREGAR a mypy.ini:
```ini
disallow_any_expr = True
disallow_any_unimported = True
strict_equality = True
```

AGREGAR a pyrightconfig.json:
```json
{
  "reportUnknownParameterType": true,
  "reportUnknownArgumentType": true,
  "reportUnknownLambdaType": true
}
```

---

### 1.2 Sustituto moderno de interfaces TS

REGLA ACTUALIZADA:
- TS interface → Python:
  - Boundary externo → Pydantic BaseModel
  - Interno liviano → TypedDict
  - Comportamiento → Protocol

EJEMPLO:
```python
from typing import Protocol

class Repo(Protocol):
    def get(self, id: str) -> str: ...
```

Esto es equivalente moderno a:
```ts
interface Repo { get(id: string): string }
```

---

### 1.3 Eliminación de clases innecesarias (tendencia 2025)

Patrón emergente:
- Preferir funciones puras + módulos pequeños
- Evitar OOP innecesario (alineado con Go)

TU PROMPT YA VA BIEN, PERO FALTABA:
- Prohibir clases sin estado real
- Evitar servicios tipo "UserService" vacíos

---

## 2. ORGANIZACIÓN JAVA-LIKE (1 FUNCIONALIDAD → 1 ARCHIVO)

### PROBLEMA ACTUAL EN TU PROMPT
No está lo suficientemente estricto.

### REGLA FUERTE (2025 best practice):

Un archivo = EXACTAMENTE una de estas:

1. Script ejecutable (tiene main)
2. Módulo de dominio (lógica pura)
3. Modelo de datos (Pydantic/TypedDict)
4. Adaptador (HTTP, DB, wmill, etc.)

PROHIBIDO:
- Mezclar lógica + IO + modelos en el mismo archivo (salvo scripts pequeños)

---

### ESTRUCTURA RECOMENDADA (Windmill + Python)

```
f/
  user/
    create_user.py          # main()
    _create_user_logic.py   # lógica pura
    _user_models.py         # Pydantic
```

REGLAS:
- Prefijo "_" = no ejecutable
- Solo archivos sin "_" pueden tener main()

---

## 3. MIGRACIÓN ASYNC → SYNC (ACTUALIZADO)

2025 guideline:
- NO migrar async automáticamente a sync
- Evaluar tipo de carga:

| Caso                         | Decisión          |
|------------------------------|-------------------|
| IO simple (1–2 requests)     | sync ✔            |
| fan-out masivo               | async ✔           |
| CPU-bound                    | multiprocessing   |

AGREGAR REGLA:

```text
Si TS usa Promise.all con >5 llamadas concurrentes → mantener async en Python
```

---

## 4. HTTP CLIENT — CAMBIO IMPORTANTE 2025

httpx sigue correcto, PERO:

Nueva recomendación:
- Siempre usar client reutilizable (no httpx.get directo)

```python
client: httpx.Client = httpx.Client(timeout=30.0)

def fetch(url: str) -> dict:
    response = client.get(url)
    response.raise_for_status()
    return response.json()
```

Evita:
- overhead de conexiones
- problemas de performance en loops

---

## 5. MANEJO DE ERRORES — ACTUALIZACIÓN

Tu modelo con returns es correcto, pero falta:

### REGLA NUEVA:
NO usar Result en:
- scripts simples (<20 líneas)
- wrappers de IO directo

USAR Result SOLO en:
- lógica de dominio reutilizable

---

### ERROR MODEL ESTÁNDAR (2025)

```python
class DomainError(BaseModel):
    code: str
    message: str
```

Evita usar str como error genérico.

---

## 6. Pydantic v2 — USO CORRECTO (IMPORTANTE)

FALTA EN TU PROMPT:

### 6.1 NO usar BaseModel para todo

| Caso                  | Usar           |
|----------------------|----------------|
| Boundary externo     | BaseModel ✔    |
| Interno simple       | TypedDict ✔    |
| Alta performance     | dataclass ✔    |

---

### 6.2 Validación estricta REAL

Agregar:
```python
model_config = ConfigDict(
    strict=True,
    extra="forbid",
)
```

Evita bugs silenciosos (clave en migraciones TS).

---

## 7. WINDMILL — CAMBIOS REALES 2025–2026

### 7.1 SDK pattern actualizado

Nueva práctica:
- Encapsular llamadas wmill en adapters

```python
def get_api_key() -> str:
    return wmill.get_variable("f/company/key")
```

Evita:
- acoplamiento directo
- facilita testing

---

### 7.2 Evitar lógica en main()

REGLA NUEVA:
main() solo:
1. valida input
2. llama caso de uso
3. serializa output

---

## 8. TESTING — ACTUALIZACIÓN

Agregar:

### 8.1 Property-based testing (2025 estándar)

```python
from hypothesis import given, strategies as st

@given(st.text(min_size=1))
def test_uppercase(x: str):
    assert _procesar(x).is_success()
```

---

### 8.2 Tests de contrato (clave en migración TS → PY)

Verificar equivalencia:

```text
TS output == Python output
```

---

## 9. SEGURIDAD Y ERRORES SILENCIOSOS

Agregar reglas faltantes:

PROHIBIDO:
```python
except Exception:
    ...
```

OBLIGATORIO:
```python
except SpecificError as e:
    raise RuntimeError(...) from e
```

---

## 10. PERFORMANCE (NUEVO 2025)

Agregar:

- Evitar Pydantic en loops internos
- Convertir a dict una sola vez
- Usar list comprehension sobre loops imperativos

---

## 11. DIFERENCIAS CRÍTICAS TS → PY (QUE FALTAN)

### 11.1 Null vs None

TS:
```ts
string | null | undefined
```

Python:
```python
str | None
```

REGLA:
- Nunca usar None implícito
- Siempre tipar Optional explícitamente

---

### 11.2 Mutabilidad (BUG FRECUENTE)

TS objects ≈ mutable
Python dict/list = mutable por referencia

Agregar regla:
```text
Nunca retornar estructuras mutadas compartidas
→ usar copy() o modelos nuevos
```

---

## 12. MEJORAS DIRECTAS A TU PROMPT (INSERTAR)

AGREGAR BLOQUE:

================================================================================
## REGLAS ADICIONALES 2025 (OBLIGATORIAS)
================================================================================

- Un archivo = una responsabilidad (Java-like estricto)
- main() no contiene lógica de negocio
- Pydantic SOLO en boundaries
- TypedDict preferido para estructuras internas
- Protocol para interfaces (reemplazo de TS interface)
- httpx.Client reutilizable (no llamadas directas)
- Result[T,E] solo en dominio, no en IO trivial
- model_config SIEMPRE con extra="forbid"
- Prohibido Any implícito (mypy strict real)
- Si TS usa Promise.all masivo → mantener async
- Encapsular wmill.* en funciones adapter
- Tests deben validar equivalencia TS vs Python
- Prohibido except Exception sin re-raise
- Evitar clases sin estado (anti-pattern 2025)
- Evitar Pydantic dentro de loops intensivos
