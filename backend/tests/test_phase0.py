from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_admin_pricing_requires_token():
    resp = client.get("/admin/pricing")
    assert resp.status_code == 401

def test_usage_requires_user_id():
    resp = client.get("/me/usage")
    assert resp.status_code == 422
