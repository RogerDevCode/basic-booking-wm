from __future__ import annotations

from f.internal._db_client import _split_asyncpg_connect_options


def test_split_asyncpg_connect_options_extracts_asyncpg_params() -> None:
    # Arrange
    db_url = (
        "postgresql://windmill:windmill@db:5432/windmill"
        "?sslmode=disable&application_name=windmill&statement_cache_size=0"
    )

    # Act
    clean_db_url, connect_kwargs = _split_asyncpg_connect_options(db_url)

    # Assert
    assert clean_db_url == "postgresql://windmill:windmill@db:5432/windmill?sslmode=disable&application_name=windmill"
    assert connect_kwargs == {"statement_cache_size": 0}


def test_split_asyncpg_connect_options_keeps_regular_query_params() -> None:
    # Arrange
    db_url = "postgresql://user:pass@localhost:5432/db?sslmode=require&application_name=booking"

    # Act
    clean_db_url, connect_kwargs = _split_asyncpg_connect_options(db_url)

    # Assert
    assert clean_db_url == db_url
    assert connect_kwargs == {}
