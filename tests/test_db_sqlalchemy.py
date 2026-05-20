# /// script
# requires-python = ">=3.13"
# dependencies = [
#   "pytest>=8.0.0",
#   "pytest-asyncio>=0.23.0",
#   "sqlalchemy>=2.0.25",
#   "aiosqlite>=0.19.0"
# ]
# ///
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from f.internal._booking_repository import BookingRepository
from f.internal._booking_service import BookingService
from f.internal._db_models import BookingORM, ClientORM, ProviderORM, ServiceORM
from f.internal._db_sqlalchemy import Base


@pytest_asyncio.fixture
async def test_session_factory() -> async_sessionmaker[AsyncSession]:
    # Use SQLite in-memory for unit testing
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    return factory


@pytest.mark.asyncio
async def test_repository_save_and_retrieve(
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    # Arrange
    provider_id = uuid4()
    service_id = uuid4()
    client_id = uuid4()
    booking_id = uuid4()

    async with test_session_factory() as session:
        async with session.begin():
            # Create provider
            provider = ProviderORM(
                provider_id=provider_id,
                name="Dr. House",
                email="house@hospital.com",
            )
            session.add(provider)

            # Create service
            service = ServiceORM(
                service_id=service_id,
                provider_id=provider_id,
                name="Consulta General",
                duration_minutes=30,
            )
            session.add(service)

            # Create client
            client = ClientORM(
                client_id=client_id,
                name="Juan Perez",
                phone="+56912345678",
                email="juan@perez.com",
            )
            session.add(client)

            # Create booking
            booking = BookingORM(
                booking_id=booking_id,
                client_id=client_id,
                provider_id=provider_id,
                service_id=service_id,
                start_time=datetime(2026, 6, 1, 10, 0),
                end_time=datetime(2026, 6, 1, 10, 30),
                status="confirmed",
                idempotency_key="key-1",
            )
            repo = BookingRepository(session)
            await repo.save(booking)

    # Act & Assert
    async with test_session_factory() as session:
        repo = BookingRepository(session)
        retrieved = await repo.find_by_id(booking_id)

        assert retrieved is not None
        assert retrieved.client_id == client_id
        assert retrieved.client.name == "Juan Perez"  # Eagerly loaded
        assert retrieved.service_id == service_id
        assert retrieved.provider_id == provider_id

        active_bookings = await repo.find_active_by_client(client_id)
        assert len(active_bookings) == 1
        assert active_bookings[0].booking_id == booking_id


@pytest.mark.asyncio
async def test_service_create_booking_transaction(
    monkeypatch: pytest.MonkeyPatch,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    # Arrange
    monkeypatch.setattr(
        "f.internal._booking_service.async_session_factory",
        test_session_factory,
    )
    provider_id = uuid4()
    service_id = uuid4()
    client_id = uuid4()
    start_time = datetime(2026, 6, 2, 11, 0)
    end_time = datetime(2026, 6, 2, 11, 30)

    async with test_session_factory() as session:
        async with session.begin():
            # Create provider
            provider = ProviderORM(
                provider_id=provider_id,
                name="Dr. Chase",
                email="chase@hospital.com",
            )
            session.add(provider)

            # Create service
            service = ServiceORM(
                service_id=service_id,
                provider_id=provider_id,
                name="Consulta Especialidad",
                duration_minutes=30,
            )
            session.add(service)

            # Create client
            client = ClientORM(
                client_id=client_id,
                name="Maria Gomez",
                email="maria@gomez.com",
            )
            session.add(client)

    service_obj = BookingService()

    # Act
    booking = await service_obj.create_booking(
        client_id=client_id,
        provider_id=provider_id,
        service_id=service_id,
        start_time=start_time,
        end_time=end_time,
        idempotency_key="key-2",
    )

    # Assert
    assert booking.booking_id is not None
    async with test_session_factory() as session:
        repo = BookingRepository(session)
        retrieved = await repo.find_by_id(booking.booking_id)
        assert retrieved is not None
        assert retrieved.provider_id == provider_id
        assert retrieved.service_id == service_id
        assert retrieved.status == "confirmed"
