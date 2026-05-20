# Task: Sincronización de Base de Datos y ORM (SQLAlchemy 2.0)

- [x] Modificar `f/internal/_db_models.py` para sincronizar con el esquema relacional real.
- [x] Modificar `f/internal/_booking_repository.py` para usar columnas y relaciones corregidas.
- [x] Modificar `f/internal/_booking_service.py` para requerir campos no nulos obligatorios.
- [x] Adaptar `tests/test_db_sqlalchemy.py` al esquema exacto de base de datos.
- [x] Aplicar migraciones SQL pendientes en la base de datos local (`booking_events` y `booking_reminder_dispatches`).
- [x] Corregir serialización en `_insert_dlq` dentro de `f/internal/booking_confirm/main.py`.
- [x] Realizar pruebas end-to-end simulando la confirmación de citas.
- [x] Validar con Ruff, Mypy, Pyright y ejecutar pytest.
