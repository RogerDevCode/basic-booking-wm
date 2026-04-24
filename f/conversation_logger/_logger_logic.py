import json
from typing import Optional, List, Dict, Any, cast
from ..internal._result import Result, DBClient, ok, fail
from ._logger_models import LogResult, InputSchema

async def persist_log(db: DBClient, input_data: InputSchema) -> Result[LogResult]:
    try:
        rows = await db.fetch(
            """
            INSERT INTO conversations (
              client_id, channel, direction, content, intent, metadata, provider_id
            ) VALUES (
              $1::uuid, $2, $3, $4, $5, $6::jsonb, $7::uuid
            ) RETURNING message_id
            """,
            input_data.client_id, input_data.channel, input_data.direction,
            input_data.content, input_data.intent, json.dumps(input_data.metadata),
            input_data.provider_id
        )

        if not rows:
            return fail("db_insert_failed: No message_id returned")

        return ok({"message_id": str(rows[0]["message_id"])})
    except Exception as e:
        return fail(f"persistence_error: {e}")
