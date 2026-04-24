# 🏥 Booking Titanium (Python Edition)

Medical appointment booking system running on **Windmill (Python 3.11+)**.

## 🚀 Key Features
- **NLU Intent Detection:** Hybrid pipeline (TF-IDF + LLM) for Spanish appointment management.
- **Atomic Transactions:** SQL-first scheduling logic with GIST exclusion for zero double-booking.
- **Multi-Tenant RLS:** Strict data isolation using PostgreSQL Row Level Security.
- **Multi-Channel:** Telegram webhook + Email notifications (Gmail/SMTP).
- **Google Calendar:** Real-time synchronization and reconciliation.

## 🏗️ Architecture (§PY 2025-2026)
This project follows the **Split-Monolith (§MON)** pattern:
- **One Responsibility per File:** `main.py` (orchestrator), `_logic.py` (pure domain), `_models.py` (Pydantic/TypedDict).
- **Strict Typing:** Managed by `mypy` and `pyright` in strict mode.
- **Result Pattern:** Explicit error handling via `tuple[Exception | None, T | None]`.

## 🛠️ Development Commands

### Verification
```bash
mypy --strict f/        # Type checking
pyright                # Type checking
pytest tests/py/ -v    # Run all contract tests
```

### Sync & Deployment
```bash
wmill generate-metadata f/{folder}/main.py
wmill sync push --yes
```

## 📋 Core Rules
Refer to **AGENTS.md** for the full set of architectural laws (§LAW, §PY, §MON, §RLS).
Refer to **PYTHON_MIGRATION_TRACE.md** for historical migration details.
