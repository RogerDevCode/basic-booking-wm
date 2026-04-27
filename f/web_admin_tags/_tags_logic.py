# mypy: disable-error-code="misc"
from datetime import datetime
from typing import Any

from ..internal._result import DBClient, Result, fail, ok
from ._tags_models import CategoryRow, InputSchema, TagRow


def map_category(r: dict[str, Any]) -> CategoryRow:
    return {
        "category_id": str(r["category_id"]),
        "name": str(r["name"]),
        "description": str(r["description"]) if r.get("description") else None,
        "is_active": bool(r["is_active"]),
        "sort_order": int(r["sort_order"]),
        "created_at": r["created_at"].isoformat()
        if isinstance(r.get("created_at"), datetime)
        else str(r.get("created_at")),
        "tag_count": int(r.get("tag_count", 0)),
    }


def map_tag(r: dict[str, Any]) -> TagRow:
    return {
        "tag_id": str(r["tag_id"]),
        "category_id": str(r["category_id"]),
        "category_name": str(r.get("category_name", "")),
        "name": str(r["name"]),
        "description": str(r["description"]) if r.get("description") else None,
        "color": str(r["color"]),
        "is_active": bool(r["is_active"]),
        "sort_order": int(r["sort_order"]),
        "created_at": r["created_at"].isoformat()
        if isinstance(r.get("created_at"), datetime)
        else str(r.get("created_at")),
    }


async def verify_admin_access(db: DBClient, user_id: str) -> Result[bool]:
    rows = await db.fetch("SELECT role FROM users WHERE user_id = $1::uuid AND is_active = true LIMIT 1", user_id)
    if not rows:
        return fail("UNAUTHORIZED: Admin user not found or inactive")
    if rows[0]["role"] != "admin":
        return fail("FORBIDDEN: Admin access required")
    return ok(True)


class TagRepository:
    def __init__(self, db: DBClient) -> None:
        self.db = db

    async def list_categories(self) -> Result[list[CategoryRow]]:
        try:
            rows = await self.db.fetch(
                """
                SELECT tc.category_id, tc.name, tc.description, tc.is_active, tc.sort_order, tc.created_at,
                       COUNT(t.tag_id) FILTER (WHERE t.is_active = true)::int AS tag_count
                FROM tag_categories tc
                LEFT JOIN tags t ON t.category_id = tc.category_id
                GROUP BY tc.category_id, tc.name, tc.description, tc.is_active, tc.sort_order, tc.created_at
                ORDER BY tc.sort_order ASC, tc.name ASC
                """
            )
            return ok([map_category(r) for r in rows])
        except Exception as e:
            return fail(f"list_categories_failed: {e}")

    async def create_category(self, name: str, description: str | None, sort_order: int) -> Result[CategoryRow]:
        try:
            rows = await self.db.fetch(
                "INSERT INTO tag_categories (name, description, sort_order) VALUES ($1, $2, $3) RETURNING *, 0 as tag_count",  # noqa: E501
                name,
                description,
                sort_order,
            )
            if not rows:
                return fail("create_failed")
            return ok(map_category(rows[0]))
        except Exception as e:
            return fail(f"create_failed: {e}")

    async def update_category(self, category_id: str, input_data: InputSchema) -> Result[CategoryRow]:
        try:
            fields = []
            params = []
            idx = 1
            for field in ["name", "description", "sort_order"]:
                val = getattr(input_data, field)
                if val is not None:
                    fields.append(f"{field} = ${idx}")
                    params.append(val)
                    idx += 1
            if not fields:
                return fail("update_failed: no fields provided")
            params.append(category_id)
            query = f"UPDATE tag_categories SET {', '.join(fields)}, updated_at = NOW() WHERE category_id = ${idx}::uuid RETURNING *, 0 as tag_count"  # noqa: E501
            rows = await self.db.fetch(query, *params)
            if not rows:
                return fail("update_failed: not found")
            return ok(map_category(rows[0]))
        except Exception as e:
            return fail(f"update_failed: {e}")

    async def set_category_status(self, category_id: str, active: bool) -> Result[dict[str, Any]]:
        try:
            rows = await self.db.fetch(
                "UPDATE tag_categories SET is_active = $1, updated_at = NOW() WHERE category_id = $2::uuid RETURNING category_id, is_active",  # noqa: E501
                active,
                category_id,
            )
            if not rows:
                return fail("not_found")
            return ok({"category_id": str(rows[0]["category_id"]), "is_active": bool(rows[0]["is_active"])})
        except Exception as e:
            return fail(f"status_failed: {e}")

    async def delete_category(self, category_id: str) -> Result[dict[str, bool]]:
        try:
            res = await self.db.execute("DELETE FROM tag_categories WHERE category_id = $1::uuid", category_id)
            return ok({"deleted": "DELETE 1" in res})
        except Exception as e:
            return fail(f"delete_failed: {e}")

    async def list_tags(self, category_id: str | None = None) -> Result[list[TagRow]]:
        try:
            if category_id:
                rows = await self.db.fetch(
                    """
                    SELECT t.*, tc.name AS category_name
                    FROM tags t JOIN tag_categories tc ON tc.category_id = t.category_id
                    WHERE t.category_id = $1::uuid
                    ORDER BY t.sort_order ASC, t.name ASC
                    """,
                    category_id,
                )
            else:
                rows = await self.db.fetch(
                    """
                    SELECT t.*, tc.name AS category_name
                    FROM tags t JOIN tag_categories tc ON tc.category_id = t.category_id
                    ORDER BY tc.sort_order ASC, t.sort_order ASC, t.name ASC
                    """
                )
            return ok([map_tag(r) for r in rows])
        except Exception as e:
            return fail(f"list_tags_failed: {e}")

    async def create_tag(
        self, category_id: str, name: str, description: str | None, color: str, sort_order: int
    ) -> Result[TagRow]:
        try:
            rows = await self.db.fetch(
                """
                INSERT INTO tags (category_id, name, description, color, sort_order)
                VALUES ($1::uuid, $2, $3, $4, $5)
                RETURNING *, (SELECT name FROM tag_categories WHERE category_id = $1::uuid) as category_name
                """,
                category_id,
                name,
                description,
                color,
                sort_order,
            )
            if not rows:
                return fail("create_tag_failed")
            return ok(map_tag(rows[0]))
        except Exception as e:
            return fail(f"create_tag_failed: {e}")

    async def update_tag(self, tag_id: str, input_data: InputSchema) -> Result[TagRow]:
        try:
            fields = []
            params = []
            idx = 1
            for field in ["name", "description", "color", "sort_order"]:
                val = getattr(input_data, field)
                if val is not None:
                    fields.append(f"{field} = ${idx}")
                    params.append(val)
                    idx += 1
            if input_data.category_id:
                fields.append(f"category_id = ${idx}::uuid")
                params.append(input_data.category_id)
                idx += 1

            if not fields:
                return fail("update_failed: no fields")
            params.append(tag_id)
            query = f"UPDATE tags SET {', '.join(fields)}, updated_at = NOW() WHERE tag_id = ${idx}::uuid RETURNING *, (SELECT name FROM tag_categories WHERE category_id = tags.category_id) as category_name"  # noqa: E501
            rows = await self.db.fetch(query, *params)
            if not rows:
                return fail("not_found")
            return ok(map_tag(rows[0]))
        except Exception as e:
            return fail(f"update_failed: {e}")

    async def set_tag_status(self, tag_id: str, active: bool) -> Result[dict[str, Any]]:
        try:
            rows = await self.db.fetch(
                "UPDATE tags SET is_active = $1, updated_at = NOW() WHERE tag_id = $2::uuid RETURNING tag_id, is_active",  # noqa: E501
                active,
                tag_id,
            )
            if not rows:
                return fail("not_found")
            return ok({"tag_id": str(rows[0]["tag_id"]), "is_active": bool(rows[0]["is_active"])})
        except Exception as e:
            return fail(f"status_failed: {e}")

    async def delete_tag(self, tag_id: str) -> Result[dict[str, bool]]:
        try:
            res = await self.db.execute("DELETE FROM tags WHERE tag_id = $1::uuid", tag_id)
            return ok({"deleted": "DELETE 1" in res})
        except Exception as e:
            return fail(f"delete_failed: {e}")
