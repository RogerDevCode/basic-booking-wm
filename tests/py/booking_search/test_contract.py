import pytest

from f.booking_search._search_logic import execute_search
from f.booking_search._search_models import SearchInput


class MockDBClient:
    async def fetchrow(self, query: str, *args: object) -> dict[str, object] | None:
        return None

    async def fetch(self, query: str, *args: object) -> list[dict[str, object]]:
        return []

    async def execute(self, query: str, *args: object) -> str:
        return "OK"

    async def close(self) -> None:
        pass


@pytest.mark.asyncio
async def test_booking_search_success() -> None:
    client = MockDBClient()
    input_data = SearchInput.model_validate(
        {"provider_id": "00000000-0000-0000-0000-000000000000", "offset": 0, "limit": 20}
    )

    err, result = await execute_search(client, input_data)

    assert err is None
    assert result is not None
    assert result["total"] == 0
    assert result["bookings"] == []
    assert result["offset"] == 0
    assert result["limit"] == 20
