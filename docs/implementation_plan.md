# Implementation Plan: Sincronización Recíproca de ORM con Esquema Postgres

Corregimos y sincronizamos los modelos de SQLAlchemy 2.0 con el esquema real de PostgreSQL definido en los scripts de migración del proyecto para solucionar los errores de columnas no definidas (`UndefinedColumnError`).

## User Review Required

> [!IMPORTANT]
> Los modelos de SQLAlchemy previos utilizaban nombres genéricos (`id`, `client_id` como campo plano) que discrepaban con las llaves primarias reales en base de datos (`client_id` en la tabla `clients` y `booking_id` en la tabla `bookings`), además de omitir campos no anulables (`service_id`, `end_time`, `idempotency_key`) y la definición de las tablas `providers` y `services`.
> 
> Esta propuesta redefine los modelos ORM para mapearse exactamente de forma bidireccional uno-a-uno con el esquema SQL real de PostgreSQL.

## Proposed Changes

### Database Layer

#### [MODIFY] [_db_models.py](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/_db_models.py)
Redefinir los modelos ORM para que coincidan de forma idéntica con el esquema de base de datos:
- **`ProviderORM`** (tabla `providers`): `provider_id` (PK, UUID), `name`, `email`, `is_active`.
- **`ServiceORM`** (tabla `services`): `service_id` (PK, UUID), `provider_id` (FK), `name`, `duration_minutes`, `is_active`.
- **`ClientORM`** (tabla `clients`): `client_id` (PK, UUID), `name`, `email`, `phone`, `telegram_chat_id`.
- **`BookingORM`** (tabla `bookings`): `booking_id` (PK, UUID), `client_id` (FK), `provider_id` (FK), `service_id` (FK), `start_time`, `end_time`, `status`, `idempotency_key`, `created_at`, `updated_at`.

#### [MODIFY] [_booking_repository.py](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/_booking_repository.py)
Actualizar métodos para usar las columnas reales (`client_id`, `booking_id`):
- `find_by_id` buscará por `booking_id`.
- `find_by_client_id` buscará por `client_id`.

#### [MODIFY] [_booking_service.py](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/f/internal/_booking_service.py)
Actualizar el método `create_booking` para que acepte todos los parámetros obligatorios de `bookings` (`client_id`, `provider_id`, `service_id`, `start_time`, `end_time`, `idempotency_key`) y cree la entidad `BookingORM` con los campos correctos.

### Tests

#### [MODIFY] [test_db_sqlalchemy.py](file:///home/manager/Sync/wildmill-proyects/booking-titanium-wm/tests/test_db_sqlalchemy.py)
Actualizar las aserciones, creación de datos mock (proveedor, servicio, cliente, cita) para que usen la estructura exacta del esquema relacional real.

## Verification Plan

### Automated Tests
- Ejecutar suite de pruebas unitarias locales con SQLite en memoria:
  ```bash
  uv run pytest tests/test_db_sqlalchemy.py
  ```
- Validar tipado y análisis estático:
  ```bash
  uv run mypy --strict f/internal/_db_sqlalchemy.py f/internal/_db_models.py f/internal/_booking_repository.py f/internal/_booking_service.py tests/test_db_sqlalchemy.py
  uv run pyright f/internal/_db_sqlalchemy.py f/internal/_db_models.py f/internal/_booking_repository.py f/internal/_booking_service.py tests/test_db_sqlalchemy.py
  ```
- Validar formato y calidad de código:
  ```bash
  uv run ruff check f/internal/ tests/test_db_sqlalchemy.py
  ```
