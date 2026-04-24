# AGENTS_REFERENCE.md — Supplementary Reference

> Companion to AGENTS.md. Consult when implementing patterns not covered
> by the main directive.

---

## PYTHON 3.13 TYPING ADDITIONS

```python
# TypeIs — superior narrowing (replaces TypeGuard)
from typing import TypeIs

def is_str_list(val: list[object]) -> TypeIs[list[str]]:
    return all(isinstance(x, str) for x in val)

# PEP 695 type aliases (no TypeAlias import needed)
type Vector   = list[float]
type Matrix   = list[Vector]
type UserId   = int

# @override — explicit subclass contract
from typing import override

class Base:
    def process(self, x: int) -> str: ...

class Child(Base):
    @override
    def process(self, x: int) -> str:   # mypy/pyright verify parent signature
        return str(x * 2)
```

---

## PYDANTIC V2 PATTERNS

```python
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Standard input model
class OrderIn(BaseModel):
    model_config = ConfigDict(strict=True)          # no coercion
    product_id: str  = Field(..., min_length=1)
    quantity: int    = Field(..., ge=1, le=1000)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("product_id")
    @classmethod
    def product_id_format(cls, v: str) -> str:
        if not v.startswith("SKU-"):
            raise ValueError("must start with SKU-")
        return v

# Cross-field validation
class DateRange(BaseModel):
    model_config = ConfigDict(strict=True)
    start: str
    end: str

    @model_validator(mode="after")
    def end_after_start(self) -> "DateRange":
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self

# Windmill resource typing (3 equivalent options)
from typing import TypedDict

class PostgresResource(TypedDict):
    host: str; port: int; dbname: str
    user: str; password: str; sslmode: str

# Or dataclass
from dataclasses import dataclass

@dataclass
class SmtpResource:
    host: str; port: int
    user: str; password: str; tls: bool = True
```

---

## RETURNS LIBRARY — FULL PATTERN

```python
from returns.result import Result, Success, Failure
from returns.pipeline import flow
from returns.pointfree import bind

# Chaining operations safely
@beartype
def _fetch(user_id: int) -> Result[dict[str, object], str]:
    data: dict[str, object] | None = db_get(user_id)
    return Success(data) if data else Failure(f"user {user_id} not found")

@beartype
def _enrich(user: dict[str, object]) -> Result[dict[str, object], str]:
    if not user.get("email"):
        return Failure("missing email")
    return Success({**user, "score": 100})

def main(user_id: int) -> dict[str, object]:
    result: Result[dict[str, object], str] = flow(
        _fetch(user_id),
        bind(_enrich),
    )
    match result:
        case Success(value):
            return value
        case Failure(err):
            raise RuntimeError(err)
```

---

## PYTEST ADVANCED PATTERNS

```python
# Parametrize with IDs (readable test names)
@pytest.mark.parametrize("qty,expected", [
    pytest.param(1,    True,  id="min_valid"),
    pytest.param(1000, True,  id="max_valid"),
    pytest.param(0,    False, id="below_min"),
    pytest.param(1001, False, id="above_max"),
])
def test_quantity_validation(qty: int, expected: bool) -> None:
    if expected:
        assert OrderIn(product_id="SKU-1", quantity=qty)
    else:
        with pytest.raises(ValidationError):
            OrderIn(product_id="SKU-1", quantity=qty)

# Fixture scoping guide
# scope="function"  → default, fresh per test (use for stateful resources)
# scope="class"     → shared within test class
# scope="module"    → shared across all tests in file
# scope="session"   → shared across entire test run (use for expensive setup)

@pytest.fixture(scope="session")
def db_connection() -> Generator[Connection, None, None]:
    conn = create_test_db()
    yield conn
    conn.close()

# Assert mock call args
def test_notifier_called_with_correct_email(mock_wmill: MagicMock) -> None:
    mock_wmill["run_script_by_path_async"].return_value = "job-123"
    result = notify_user("alice@example.com")
    mock_wmill["run_script_by_path_async"].assert_called_once_with(
        "f/notifications/send_email",
        {"to": "alice@example.com"},
    )
    assert result == "job-123"
```

---

## WINDMILL ADVANCED PATTERNS

```python
# Fan-out parallel execution
def main(item_ids: list[str]) -> dict[str, object]:
    job_ids: list[str] = [
        wmill.run_script_by_path_async("f/team/process", {"id": id_})
        for id_ in item_ids
    ]
    results: list[object] = [wmill.get_result(j) for j in job_ids]
    return {"count": len(results), "results": results}

# Parallel tasks within script
import wmill

@wmill.task
def _enrich_item(item: str) -> dict[str, object]:
    return {"item": item, "enriched": item.upper()}

def main(items: list[str]) -> dict[str, object]:
    results: list[dict[str, object]] = [_enrich_item(i) for i in items]
    return {"results": results}

# Persistent state between executions (same trigger/schedule)
import time

def main() -> dict[str, object]:
    state: dict[str, object] = wmill.get_state() or {}
    last_run: float = float(state.get("last_ts", 0))
    # ... process only items created after last_run
    wmill.set_state({"last_ts": time.time()})
    return {"processed": True}

# S3 operations
from wmill import S3Object

def main(file: S3Object) -> dict[str, object]:
    data: bytes           = wmill.load_s3_file(file)
    out: S3Object         = wmill.write_s3_file(None, data, "output/result.json")
    url: str              = wmill.get_presigned_s3_public_url(out)
    return {"url": url}

# Multi-thread (wmill client is NOT thread-safe — separate instance per thread)
from wmill import Windmill
import threading

def _worker(item: str) -> object:
    client: Windmill = Windmill()          # fresh instance per thread
    return client.run_script_by_path("f/team/script", {"item": item})

def main(items: list[str]) -> dict[str, object]:
    with threading.ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(_worker, items))
    return {"results": results}
```

---

## WINDMILL ENV VARS (accessible via os.environ)

| Variable             | Content                              |
|----------------------|--------------------------------------|
| `WM_USERNAME`        | Executing user's username            |
| `WM_EMAIL`           | Executing user's email               |
| `WM_JOB_ID`          | Current job UUID                     |
| `WM_WORKSPACE`       | Workspace name                       |
| `WM_TOKEN`           | Auth token (used internally by wmill)|
| `WM_BASE_URL`        | Windmill instance base URL           |
| `WM_FLOW_JOB_ID`     | Parent flow job UUID (if in a flow)  |
| `WM_FLOW_STEP_ID`    | Current step ID in flow              |
| `WM_ROOT_FLOW_JOB_ID`| Root flow UUID                       |
| `WM_JOB_PATH`        | Script path of current job           |

---

## RELATIVE IMPORTS IN WINDMILL

```python
# File at: f/my_folder/script_main.py
# Imports from same folder:
from .script_util import helper_fn

# Imports from another folder:
from f.other_folder.helpers import util_fn

# From parent:
from ..shared.validators import validate_email

# Scripts without main() = shared logic (not independently runnable)
# They are importable by other scripts in the workspace.
```

---

## CI/CD GATE TEMPLATE (.github/workflows/ci.yml)

```yaml
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with: { python-version: "3.13" }
      - run: uv sync --frozen
      - run: uv run mypy --strict .
      - run: uv run pyright .
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run pytest --tb=short -q
```

---

## ANTI-HALLUCINATION PROMPTING RULES

Apply these when writing prompts for LLMs in this project:

```
PE-01  State role + task in first 2 sentences.
PE-02  Scope: "Only use information provided. If unknown, say 'I don't know'."
PE-03  Constraints before examples, not after.
PE-04  Use XML/markdown delimiters for multi-section prompts.
PE-05  Imperative mood: "Return", "Never", "Always" — not "please" or "try to".
PE-06  Specify exact output format: "Return JSON with keys: id, status, error."
PE-07  Decompose: one prompt = one task. Chain for multi-step.
PE-08  For reasoning models (o-series): high-level goals, no CoT instruction.
       For GPT/Sonnet: explicit step-by-step guidance.
PE-09  Temperature 0–0.2 for deterministic code/data tasks.
PE-10  Add verification clause: "Before responding, verify X is satisfied."
```

