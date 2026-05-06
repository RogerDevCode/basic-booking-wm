from __future__ import annotations

import pytest
import redis


# Patch redis.from_url globally during test collection/execution
@pytest.fixture(autouse=True)
def mock_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    class DummyRedis:
        def keys(self, *args: object, **kwargs: object) -> list[object]:
            return []

        def mget(self, *args: object, **kwargs: object) -> list[None]:
            return [None]

        def set(self, *args: object, **kwargs: object) -> None:
            pass

        def pipeline(self) -> DummyRedis:
            return self

        def execute(self) -> None:
            return None

        def flushall(self) -> None:
            return None

    monkeypatch.setattr(redis, "from_url", lambda *args, **kwargs: DummyRedis())
