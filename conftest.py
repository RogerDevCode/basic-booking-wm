from __future__ import annotations

import pytest
import redis


# Patch redis.from_url globally during test collection/execution
@pytest.fixture(autouse=True)
def mock_redis(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    node = getattr(request, "node", None)
    if node is not None:
        nodeid = getattr(node, "nodeid", "")
        if isinstance(nodeid, str) and "integration" in nodeid:
            return

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

    def dummy_from_url(*args: object, **kwargs: object) -> DummyRedis:
        return DummyRedis()

    monkeypatch.setattr(redis, "from_url", dummy_from_url)
