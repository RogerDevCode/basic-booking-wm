from ..internal._result import Result, DBClient, ok
from ._search_models import SearchInput, BookingSearchResult

from typing import cast

async def execute_search(client: DBClient, input_data: SearchInput) -> Result[BookingSearchResult]:
    # TODO: Implement actual search query when required.
    # Currently maintaining parity with the TS stub.
    return ok(cast(BookingSearchResult, {
        "bookings": [],
        "total": 0,
        "offset": input_data.offset,
        "limit": input_data.limit
    }))
