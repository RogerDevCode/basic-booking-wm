"""
PRE-FLIGHT
Mission          : Simple entity extractor helper.
DB Tables        : NONE
Concurrency Risk : NO
GCal Calls       : NO
Idempotency Key  : NO
RLS Tenant ID    : NO
Zod Schemas      : NO
"""


def get_entity(entities: dict[str, str | None], key: str) -> str | None:
    """Extracts a value from the entities dictionary, returning None if not found."""
    return entities.get(key)
