from __future__ import annotations

import json
from typing import TYPE_CHECKING

from ._config_service import default_preferences, parse_preferences_payload

if TYPE_CHECKING:
    from ..internal._result import DBClient
    from ._config_models import ReminderPreferences


async def load_preferences(db: DBClient, client_id: str) -> ReminderPreferences:
    rows = await db.fetch("SELECT metadata FROM clients WHERE client_id = $1::uuid LIMIT 1", client_id)
    if not rows:
        return default_preferences()

    metadata_raw = rows[0].get("metadata")
    if metadata_raw is None:
        return default_preferences()

    metadata_obj: object
    if isinstance(metadata_raw, str):
        metadata_obj = json.loads(metadata_raw)
    else:
        metadata_obj = metadata_raw

    if not isinstance(metadata_obj, dict):
        raise ValueError("client_metadata_invalid")

    raw_preferences = metadata_obj.get("reminder_preferences")
    return parse_preferences_payload(raw_preferences)


async def save_preferences(db: DBClient, client_id: str, preferences: ReminderPreferences) -> None:
    await db.execute(
        """
        UPDATE clients
        SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{reminder_preferences}',
              $1::jsonb
            ),
            updated_at = NOW()
        WHERE client_id = $2::uuid
        """,
        preferences.model_dump_json(),
        client_id,
    )
