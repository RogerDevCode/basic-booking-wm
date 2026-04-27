import pytest
from unittest.mock import AsyncMock, patch
from f.web_admin_specialties_crud.main import main

@pytest.mark.asyncio
async def test_admin_specialty_list_success() -> None:
    mock_db = AsyncMock()
    # 1. list_specialties fetch
    mock_db.fetch.return_value = [{
        "specialty_id": "s1", "name": "Cardiología", "description": "Desc",
        "category": "Medicina", "is_active": True, "sort_order": 1,
        "created_at": "2026-05-01T10:00:00Z"
    }]
    
    async def mock_with_tenant(db, tid, op):
        return await op()

    with patch("f.web_admin_specialties_crud.main.create_db_client", return_value=mock_db), \
         patch("f.web_admin_specialties_crud.main.with_tenant_context", side_effect=mock_with_tenant):
        
        args = {"action": "list", "admin_user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
        err, result = await main(args)
        
        assert err is None
        assert len(result) == 1
        assert result[0]["name"] == "Cardiología"
