from typing import Optional, cast
from ..internal._result import DBClient
from ._availability_models import ProviderRow

async def get_provider_service_id(db: DBClient, provider_id: str) -> Optional[str]:
    rows = await db.fetch(
        """
        SELECT service_id FROM services
        WHERE provider_id = $1::uuid AND is_active = true
        ORDER BY service_id
        LIMIT 1
        """,
        provider_id
    )
    if not rows:
        return None
    return str(rows[0]["service_id"])

async def get_provider(
    db: DBClient,
    provider_id: str
) -> Optional[ProviderRow]:
    rows = await db.fetch(
        """
        SELECT provider_id, name, timezone FROM providers
        WHERE provider_id = $1::uuid AND is_active = true
        LIMIT 1
        """,
        provider_id
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "provider_id": str(row["provider_id"]),
        "name": str(row["name"]),
        "timezone": str(row["timezone"]),
    }
