# AGENTS.md — Python/Windmill Operational Directive v1.0

## MISSION PROFILE

You are a **senior Python/Windmill engineer**. Execute all tasks under the following
standing orders. No deviation. Semper fidelis.

---

## ABSOLUTE LAWS (non-negotiable — all must hold before any PR merges)

```
LAW-01  Every var, param, return has explicit type annotation. No exceptions.
LAW-02  mypy --strict → 0 errors. pyright --strict → 0 errors.
LAW-03  ruff check + ruff format pass clean.
LAW-04  pytest → 0 failures. Coverage ≥ 80 % on business logic.
LAW-05  1 file = 1 responsibility. Never grow a module beyond its stated concern.
LAW-06  All boundaries use Pydantic v2 strict=True. No bare dicts crossing fns.
LAW-07  Failures propagate as exceptions. Never return {"ok": False, "error": …}.
LAW-08  Side-effects live inside functions. Top-level is imports + constants only.
LAW-09  External deps are mocked in tests. No live network/db/wmill calls in tests.
LAW-10  pyproject.toml is the single source of truth. No requirements.txt.
```

---

## TOOLCHAIN (Python 3.13 · uv · ruff · mypy · pyright · pytest)

| Tool       | Role                                    | Config in pyproject.toml        |
|------------|-----------------------------------------|----------------------------------|
| uv         | venv + dep management (replaces pip)    | `[tool.uv]`                     |
| ruff       | lint + format (replaces black/flake8)   | `[tool.ruff]`                   |
| mypy       | static type checker (CI gate)           | `[tool.mypy]`                   |
| pyright    | static type checker (IDE + CI gate)     | pyrightconfig.json              |
| pytest     | test runner                             | `[tool.pytest.ini_options]`     |
| pydantic   | runtime validation at data boundaries  | —                               |
| beartype   | runtime type-guard on pure functions   | —                               |
| returns    | Railway-oriented error handling        | —                               |

### pyproject.toml baseline

```toml
[project]
requires-python = ">=3.13"

[tool.mypy]
python_version = "3.13"
strict = true
warn_return_any = true
warn_unused_ignores = true

[tool.ruff]
line-length = 120
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "ANN", "B", "RUF", "TCH"]
ignore  = ["ANN101", "ANN102"]

[tool.ruff.format]
quote-style = "double"

[tool.pytest.ini_options]
testpaths  = ["tests"]
addopts    = "-ra --strict-markers --import-mode=importlib"
```

---

## FILE STRUCTURE (Java-like: 1 file = 1 feature/concern)

```
src/
  <pkg>/
    user_create.py      ← ONE concern: create user
    user_delete.py      ← ONE concern: delete user
    user_validate.py    ← ONE concern: validation logic
    models.py           ← shared Pydantic models (no logic)
    errors.py           ← custom exception hierarchy
tests/
  test_user_create.py   ← mirrors src layout
  test_user_delete.py
  conftest.py           ← shared fixtures only
pyproject.toml
```

**Rules:**
- Filename = single verb+noun: `invoice_generate.py`, `payment_process.py`
- `utils.py` / `helpers.py` / `common.py` are **banned** — they grow into
  grab-bags. Create a named module instead.
- `__init__.py` exposes public API only. No logic.
- Shared fixtures → `conftest.py`. Never duplicate fixture code.

---

## TYPING CONTRACT (Go-like strict typing)

```python
# FILE HEADER — always line 1
from __future__ import annotations

# Use builtin generics (PY3.9+), NOT typing module equivalents
# list[str]  dict[str, int]  str | None  tuple[int, ...]
# NOT: List[str]  Dict  Optional[str]  Tuple

# Constants
from typing import Final
MAX_RETRIES: Final[int] = 3

# Every function — fully annotated
def process(items: list[str], limit: int = 100) -> dict[str, int]:
    result: dict[str, int] = {}
    for item in items:
        count: int = len(item)
        result[item] = count
    return result

# Pydantic v2 at every data boundary
from pydantic import BaseModel, ConfigDict, Field

class UserIn(BaseModel):
    model_config = ConfigDict(strict=True)
    name: str  = Field(..., min_length=1, max_length=100)
    age: int   = Field(..., ge=0, le=150)

# beartype ONLY on pure internal functions (never on main() or Pydantic-fed fns)
from beartype import beartype

@beartype
def _compute(value: int, factor: float) -> float:
    return value * factor
```

**Python 3.13 typing features to use:**
- `TypeIs` for type narrowing (superior to `TypeGuard`)
- PEP 695 type aliases: `type Vector = list[float]`
- `@override` decorator for subclass methods

---

## ERROR HANDLING (Railway-Oriented Pattern)

```python
from returns.result import Result, Success, Failure

# Internal functions return Result, never raise
@beartype
def _validate(data: str) -> Result[str, str]:
    if not data.strip():
        return Failure("empty input")
    return Success(data.upper())

# Boundary (main / API handler) converts Failure → exception
def main(data: str) -> dict[str, object]:
    match _validate(data):
        case Success(value):
            return {"result": value}
        case Failure(err):
            raise RuntimeError(f"validation failed: {err}")

# FORBIDDEN patterns:
# except Exception: pass              ← silent swallow
# except Exception as e: return {}    ← Windmill sees SUCCESS
# return {"ok": False, "error": e}    ← Windmill sees SUCCESS
```

---

## TESTING CONTRACT (pytest · AAA · SRP)

**Structure rules:**
- 1 test file per source file: `src/x.py` → `tests/test_x.py`
- 1 test = 1 behavior. Never assert multiple unrelated things.
- Name: `test_<unit>_<scenario>_<expected>` — e.g.
  `test_process_empty_input_raises`
- Pattern: **Arrange → Act → Assert** (AAA). No exceptions.

```python
# conftest.py — shared fixtures, nothing else
import pytest
from unittest.mock import MagicMock, patch

@pytest.fixture
def valid_user_data() -> dict[str, object]:
    return {"name": "Alice", "age": 30}

# test_user_create.py
import pytest
from pydantic import ValidationError
from src.pkg.user_create import create_user, UserIn

class TestCreateUser:
    def test_valid_input_returns_id(self, valid_user_data: dict[str, object]) -> None:
        # Arrange
        model = UserIn(**valid_user_data)
        # Act
        result = create_user(model)
        # Assert
        assert "id" in result

    def test_empty_name_raises_validation_error(self) -> None:
        with pytest.raises(ValidationError):
            UserIn(name="", age=30)

    def test_failure_propagates_as_runtime_error(self) -> None:
        with pytest.raises(RuntimeError):
            create_user(UserIn(name="x", age=-1))

    @pytest.mark.parametrize("age", [-1, 151, 999])
    def test_invalid_age_rejected(self, age: int) -> None:
        with pytest.raises(ValidationError):
            UserIn(name="Bob", age=age)
```

**Mocking strategy:**
- Mock at the **boundary** of the unit under test, not deep inside it.
- Use `@patch("src.pkg.module.dependency")`, not `unittest.mock.patch.object`
  on internals.
- Always assert mock was called with expected args when behavior matters.

---

## WINDMILL DIRECTIVES

### Script template (PEP-723 deps header)

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "pydantic==2.*",
#   "beartype==0.18.*",
#   "returns==0.22.*",
# ]
# ///
from __future__ import annotations

import logging
from typing import Any, Final

import wmill                        # top-level import is correct
from beartype import beartype
from pydantic import BaseModel, ConfigDict, Field
from returns.result import Failure, Result, Success

logger: Final[logging.Logger] = logging.getLogger(__name__)
```

### Windmill SDK (corrected — use non-deprecated names)

| TS (windmill-client)              | Python (wmill)                        |
|-----------------------------------|---------------------------------------|
| `getVariable(path)`               | `wmill.get_variable(path)`            |
| `setVariable(path, val)`          | `wmill.set_variable(path, val)`       |
| `getResource(path)`               | `wmill.get_resource(path)`            |
| `createResource / updateResource` | `wmill.set_resource(path, body)`      |
| `runScriptAsync(path, args)`      | `wmill.run_script_by_path_async(...)`  |
| `runScript(path, args)` (sync)    | `wmill.run_script_by_path(...)`       |
| `getJobResult(id)` **→ WRONG**    | `wmill.get_result(id)`  ← correct     |
| `getState() / setState()`         | `wmill.get_state() / wmill.set_state()`|
| `setProgress(n)`                  | `wmill.set_progress(n)`               |

**NEVER call:** `wmill.run_script()`, `wmill.run_script_async()`,
`wmill.get_job_result()` — **all deprecated**.

### Windmill-specific rules

```
WM-01  main() is sync by default. async only if genuinely concurrent I/O.
WM-02  Failure in main() → raise RuntimeError. Windmill marks job FAILED.
WM-03  wmill.* calls live inside functions, never at module level.
WM-04  Resources typed as TypedDict or Pydantic model, never bare dict.
WM-05  wmill.cancel_running() at top of main() for singleton scripts.
WM-06  set_progress() on loops >30 s duration.
WM-07  @wmill.task for fan-out parallelism within a script.
WM-08  Batch errors: return {"ok": …, "errors": [...]} only if partial
       failures are a documented design decision.
```

### Windmill test mock fixture

```python
# conftest.py
import pytest
from unittest.mock import MagicMock, patch

@pytest.fixture(autouse=True)
def windmill_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WM_WORKSPACE", "test")
    monkeypatch.setenv("WM_TOKEN",     "test")
    monkeypatch.setenv("WM_BASE_URL",  "http://localhost:8000")

@pytest.fixture
def mock_wmill() -> MagicMock:
    with patch.multiple(
        "wmill",
        get_variable              = MagicMock(return_value="val"),
        get_resource              = MagicMock(return_value={}),
        set_resource              = MagicMock(),
        get_state                 = MagicMock(return_value=None),
        set_state                 = MagicMock(),
        set_progress              = MagicMock(),
        cancel_running            = MagicMock(),
        run_script_by_path        = MagicMock(return_value={}),
        run_script_by_path_async  = MagicMock(return_value="fake-job-id"),
        get_result                = MagicMock(return_value={}),
        get_job_status            = MagicMock(return_value="COMPLETED"),
    ) as m:
        yield m
```

---

## FORBIDDEN LIST

```
BANNED-01  utils.py / helpers.py / common.py / misc.py — create named modules
BANNED-02  Any untyped variable, param, or return
BANNED-03  except Exception: pass  or  except:
BANNED-04  return {"ok": False, "error": …}  at Windmill boundary
BANNED-05  Live wmill.* / DB / HTTP calls inside test code
BANNED-06  frozen=True on InputModel unless immutability is explicitly required
BANNED-07  @beartype on main() or any function whose inputs are Pydantic-validated
BANNED-08  requirements.txt — use pyproject.toml + uv
BANNED-09  Mutable default args: def f(x: list = [])
BANNED-10  Implicit Any: unresolved type inference must be explicit cast(T, val)
```

---

---

## CODEBASE INDEX

**MANDATORY: Read `.ai-codex/summary.md` before opening any source file.**
Contains the full public API map (functions, classes, Windmill scripts).
Saves 20–50K tokens of file exploration per session.

### Index files

| File                         | Content                          | Tool            |
|------------------------------|----------------------------------|-----------------|
| `.ai-codex/summary.md`       | Public API by module (AST-based) | pre-commit hook |
| `.codebase-index-cache.pkl`  | Structural index (MCP server)    | auto (git diff) |

### MCP tools — mcp-codebase-index (Claude Code, Gemini CLI, kilocode)

Use these tools instead of reading files directly:

| Tool                  | Use when                                     |
|-----------------------|----------------------------------------------|
| `find_symbol`         | Need location of any function or class       |
| `get_change_impact`   | Before refactoring: find what breaks         |
| `get_callers`         | Who calls this function?                     |
| `get_call_graph`      | Trace execution path from entry point        |
| `find_tests`          | Find tests covering a symbol                 |
| `get_dependencies`    | What does this file import transitively?     |

### Rules

```
IDX-01  Read .ai-codex/summary.md FIRST — always, every session.
IDX-02  Use MCP find_symbol over grep or read-file for symbol search.
IDX-03  Use MCP get_change_impact before any refactor touching >2 files.
IDX-04  .ai-codex/summary.md is auto-generated — never edit manually.
IDX-05  .codebase-index-cache.pkl is gitignored — local build artifact.
IDX-06  Stale index: run  uv run python scripts/gen_summary.py
```

### Start MCP server (if not auto-started)

```bash
PROJECT_ROOT=$(pwd) uv run python -m mcp_codebase_index.server
```

### Tool context file map

| Tool         | Context file read      | MCP config                    |
|--------------|------------------------|-------------------------------|
| Claude Code  | AGENTS.md              | .claude/settings.json         |
| Gemini CLI   | AGENTS.md (configured) | .gemini/settings.json         |
| kilocode CLI | AGENTS.md              | .kilocode/mcp.json            |
| Qwen CLI     | AGENTS.md              | (no MCP — Layer 1 only)       |

---

## DELIVERY PROTOCOL

Before marking any task complete, execute in order:

```bash
uv run mypy --strict .          # must → 0 errors
uv run pyright .                # must → 0 errors
uv run ruff check --fix .       # must → 0 remaining
uv run ruff format .
uv run pytest --tb=short -q     # must → 0 failures
```

If any gate fails → fix it. Do not skip. Do not suppress errors with `# type: ignore`
without a comment explaining why it is unavoidable.

---

## TASK EXECUTION ORDER

When implementing a feature:

```
1. SPEC    — state what the file does in one sentence before writing code
2. MODEL   — define Pydantic models (inputs/outputs)
3. LOGIC   — implement pure functions returning Result[T, E]
4. ENTRY   — wire main() / handler to call logic, raise on Failure
5. TEST    — write tests covering: happy path, edge cases, error propagation
6. GATES   — run all 5 gate commands, fix until clean
7. COMMIT  — conventional commit: feat(scope): description
```

Do not proceed to step N+1 if step N is not complete.

---

## TYPE FIX CASCADE (mypy --strict → 0 errors)

### Allowed `# type: ignore` — ONLY these two, nowhere else

```
import asyncpg  # type: ignore[import-untyped]   ← no official stubs
return wmill    # type: ignore[return-value]      ← SDK boundary
```

### Stub setup (wmill not installed → manual stubs)

```
stubs/wmill/__init__.pyi   ← object | None, dict[str, object] (no Any)
mypy.ini                   ← [mypy-wmill.*] ignore_missing_imports = True
                              [mypy-asyncpg.*] ignore_missing_imports = True
pyrightconfig.json         ← "stubPath": "./stubs"
```

### Cascade order (leaves → trunk)

```
L0  stubs/wmill/__init__.pyi          remove Any/Dict/Optional legacy
L0  _config.py                        Optional/List → str|None / list[...]
L0  booking_fsm/_fsm_models.py        remove unused Any/Dict imports
L0  booking_fsm/_fsm_responses.py     remove unused Any/Dict imports
L0  ai_agent/_prompt_builder.py       dict_values[str,object] fix
──
L1  _wmill_adapter.py                 restore get_variable → str|None wrapper
L1  _result.py                        TypeIs replaces cast(Exception,...)
──
L2  _db_client.py                     uses restored get_variable; asyncpg boundary
L2  ai_agent/_llm_client.py           TypedDict ProviderConfig + LLMAPIResponse
L2  _date_resolver.py                 bool|Any → explicit TypeIs
L2  gcal_utils/_oauth_logic.py
L2  booking_fsm/_fsm_machine.py       _as_named_items() / _as_time_slots() TypeIs
L2  scheduling_engine/
──
L3+ every feature main.py             fix in dependency order
```

### Rules

```
NEVER  cast() without TypeIs/isinstance check first
NEVER  Any in public signatures
NEVER  List[T] Dict[K,V] Optional[T] — use list[T] dict[K,V] T|None
NEVER  # mypy: disable-error-code at file level
USE    TypeIs (PEP 742) for narrowing at every data boundary
USE    Pydantic TypedDict for all external data shapes (HTTP, DB, wmill)
```

### Verify after each commit

```bash
MYPYPATH=./stubs uv run mypy --strict f/internal/
uv run pyright f/internal/
# must: 0 errors, 0 non-permitted ignores
```



<claude-mem-context>
# Memory Context

# [booking-titanium-wm] recent context, 2026-04-26 12:51pm GMT-4

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 46 obs (17,899t read) | 263,463t work | 93% savings

### Apr 24, 2026
S2 Debuggear flujo Telegram→Booking en Windmill usando Aislamiento Modular Progresivo + Bisección + Stubbing (Apr 24, 8:14 PM)
S1 Modular isolation debug session for Telegram→Booking Windmill flow — tracking per-module unit test results (Apr 24, 8:14 PM)
1 8:15p ⚖️ Aislamiento Modular Progresivo como Técnica de Depuración en Windmill
S24 Full 5-Step telegram_webhook Flow Works End-to-End — /start Message Delivered (Apr 24, 8:16 PM)
2 8:17p 🔵 booking-titanium-wm Windmill Project Architecture
3 8:19p 🔵 Windmill Docker Stack Has Unhealthy Extra Container
4 " 🔵 Non-Standard Docker Compose File Naming in booking-titanium-wm
5 " 🔵 Windmill CE v1.690.0 Confirmed Running on Port 8080
6 " 🔐 Credentials Stored in Plaintext .env File
7 " ✅ Attempted Migration of TELEGRAM_BOT_TOKEN to Workspace-Scoped Secret Variable
8 8:20p 🔵 WM_TOKEN in .env Is Stale — Default Admin Credentials Still Work
9 " 🔵 TELEGRAM_BOT_TOKEN Variable Has No Workspace Permissions
10 9:49p 🔵 Windmill Flow Engine Ignores CLI-Pushed flow.yaml Updates
11 9:50p 🔄 telegram_send/main.py: Async Wrapper Pattern + Variable Path Fallback
12 " 🟣 flow.yaml Redesigned: 5-Step Full-Stack Python Pipeline Replaces v9.1
14 9:51p 🔵 Windmill Flow API: Correct Path is f/flows/telegram_webhook, Trigger Endpoint Returns Empty Job ID
15 " 🔵 Windmill REST API: Correct Flow Trigger Endpoints Identified from OpenAPI Spec
16 " 🔵 Flow Executes Successfully — Final Step Fails with TELEGRAM_BOT_TOKEN_MISSING
17 9:52p 🔵 TELEGRAM_BOT_TOKEN_MISSING Root Cause: Variable Exists but extra_perms is Empty
18 " 🔐 Telegram Bot Token Stored as Non-Secret Plaintext Variable
19 9:53p 🔵 Windmill Variable Access Discrepancy: Preview Context vs Script Execution Context
21 9:54p 🔵 _wmill_adapter.get_variable Implementation is Correct — Bug is Execution Context Permissions
22 9:55p 🔴 Critical Bug in _wmill_adapter: wmill.get_variable Raises Exception on 404, Not Returns None
23 " 🔵 _wmill_adapter Exception Fix Deployed but telegram_send Still Returns TELEGRAM_BOT_TOKEN_MISSING
25 9:56p 🔵 Updated _wmill_adapter Is Live but wmill.get_variable Returns Falsy for g/all Token in Package Context
27 9:58p 🔴 telegram_send Bypasses _wmill_adapter for Token Lookup — Calls wmill Directly
28 " 🔵 Direct wmill.get_variable Also Fails in Saved Script Context — Fundamental Windmill Worker Permission Issue
29 9:59p 🔵 Correct Script Hash Confirmed Running — Variable Access Fundamentally Blocked in Saved Script Context
30 " 🔵 wmill Module Availability is Path-Dependent in Windmill Previews
31 10:00p 🔵 Windmill wmill Module Not Available Even in Path-Scoped Previews
32 " ⚖️ telegram_send Token Resolution Changed to Flow Injection Instead of Windmill Variable Reads
33 " ✅ telegram_send Function Signature Updated to Accept bot_token Parameter
34 " ✅ telegram_webhook Flow Updated to Inject bot_token via variable() Function
35 10:01p 🔵 telegram_send Pydantic Schema Rejects bot_token as Extra Field
36 " 🔴 telegram_send Extracts bot_token Before Pydantic Validation Using args.pop()
39 " 🟣 Full 5-Step telegram_webhook Flow Works End-to-End — /start Message Delivered
S27 Resume booking-titanium-wm project after multi-day stall — diagnose and fix why Telegram webhook flow produces no results (Apr 24, 10:01 PM)
37 10:02p 🔴 telegram_send Script Successfully Sends Telegram Message — First End-to-End Success
S28 Root Causes: Silent 404 Errors and wmill.get_variable() Failure in Windmill Workers (Apr 24, 10:03 PM)
40 10:08p 🔵 Root Causes: Silent 404 Errors and wmill.get_variable() Failure in Windmill Workers
S29 Code quality discussion — should try/except blocks use else clause to prevent silent errors in booking-titanium-wm (Apr 24, 10:08 PM)
41 10:16p ⚖️ Global Try/Except Error Wrapping Plan — Full Codebase Coverage
42 10:17p 🔵 booking-titanium-wm Python Script Inventory
43 " 🔵 booking-titanium-wm Codebase Size and Existing Except Coverage Baseline
44 " 🔵 Error Handling Audit: 124 Silent Except Blocks Found Across 190 Python Files
### Apr 25, 2026
49 10:35a 🔵 Silent Except Block Audit — 23 Silent, 142 Logging, 2 Unguarded Functions
50 10:54a 🔵 GitHub MCP Configured via pluginConfigs, Not mcpServers — Token Uses Env Var Reference
51 10:57a 🟣 mcp-compressor Schema Compression Deployed and Validated for booking-titanium-wm
52 " 🔵 booking-titanium-wm Has 200+ Uncommitted Files Staged — 5 Commits Ahead of origin/main
S43 Configure GitHub MCP correctly — session pivoted to full MCP token optimization, delivering Layer 1 schema compression for booking-titanium-wm (Apr 25, 10:58 AM)
53 10:59a 🔵 claude-mem Already Active on System — 12MB SQLite DB with Live WAL Writes
54 " 🟣 claude-mem Layer 2 Token Optimization Configured — Progressive Disclosure + HNSW Tuning
### Apr 26, 2026
55 12:14p 🔵 Windmill URL Must Use Cloudflare Tunnel Public Address for External Tool Access

Access 263k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>