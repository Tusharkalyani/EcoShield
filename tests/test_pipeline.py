"""End-to-end integration tests for the EcoShield pipeline.

Tests cover:
1. Field-level AES-256 (Fernet) encryption and decryption.
2. Anti-spoofing HMAC-SHA256 signature generation and verification.
3. Geospatial intersection matching (Shapely point-in-polygon & PostGIS query).
4. FastAPI endpoints:
   - POST /farmers (registration with encrypted phone & spatial point)
   - POST /predict-zone (spatial grid feature extraction, ML scoring, alert dispatch)
   - POST /sightings (JWT-gated RBAC enforcement for rangers)
"""

from __future__ import annotations

import uuid
from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Point, box

from app.core.database import get_db
from app.core.security import (
    Role,
    create_access_token,
    decrypt_field,
    encrypt_field,
    generate_hmac_signature,
    verify_hmac_signature,
)
from app.db.models import Farmer, RiskGridCell
from app.main import app
from app.services.alert_service import query_farmers_in_risk_zones


# =====================================================================
# 1. FIELD-LEVEL AES-256 ENCRYPTION / DECRYPTION
# =====================================================================


def test_encryption_roundtrip():
    """Verify phone numbers and coordinates encrypt and decrypt cleanly."""
    phone = "+250788123456"
    encrypted = encrypt_field(phone)
    assert encrypted != phone
    decrypted = decrypt_field(encrypted)
    assert decrypted == phone

    gps = "-1.4925,29.5120"
    enc_gps = encrypt_field(gps)
    assert enc_gps != gps
    assert decrypt_field(enc_gps) == gps


def test_encryption_corrupted_token():
    """Corrupted ciphertext must raise ValueError."""
    corrupted = "gAAAAABinvalidtokenbase64data"
    with pytest.raises(ValueError, match="Decryption failed"):
        decrypt_field(corrupted)


def test_encryption_empty_input():
    """Empty strings cannot be encrypted or decrypted."""
    with pytest.raises(ValueError):
        encrypt_field("")
    with pytest.raises(ValueError):
        decrypt_field("")


# =====================================================================
# 2. ANTI-SPOOFING HMAC-SHA256 SIGNING
# =====================================================================


def test_hmac_signature_generation_and_verification():
    """Test HMAC signing and constant-time verification."""
    payload = '{"event": "wildlife_detected", "cell_id": "R0001_C0002"}'
    sig = generate_hmac_signature(payload)
    assert isinstance(sig, str)
    assert len(sig) == 64  # SHA-256 hex digest length

    # Valid payload
    assert verify_hmac_signature(payload, sig) is True

    # Tampered payload
    tampered_payload = payload.replace("R0001_C0002", "R0001_C9999")
    assert verify_hmac_signature(tampered_payload, sig) is False

    # Custom secret
    custom_secret = "super_custom_secret_key"
    custom_sig = generate_hmac_signature(payload, secret=custom_secret)
    assert verify_hmac_signature(payload, custom_sig, secret=custom_secret) is True
    assert verify_hmac_signature(payload, custom_sig, secret="wrong_secret") is False


# =====================================================================
# 3. SPATIAL INTERSECTION MATCHING
# =====================================================================


def test_spatial_point_in_polygon_intersection():
    """Verify Shapely containment logic used by PostGIS ST_Contains."""
    # A 500m grid cell polygon near (-1.50, 29.50)
    cell_polygon = box(29.500, -1.505, 29.505, -1.500)

    farmer_inside = Point(29.502, -1.502)
    farmer_outside = Point(29.510, -1.510)
    farmer_border = Point(29.500, -1.500)

    assert cell_polygon.contains(farmer_inside) is True
    assert cell_polygon.contains(farmer_outside) is False
    assert cell_polygon.intersects(farmer_border) is True


def test_postgis_query_compilation():
    """Verify query_farmers_in_risk_zones builds the expected SQL query with ST_Contains."""
    mock_db = MagicMock()
    mock_db.execute.return_value.all.return_value = []

    target_date = date(2026, 11, 4)
    results = query_farmers_in_risk_zones(mock_db, target_date=target_date, risk_threshold=0.75)

    assert results == []
    assert mock_db.execute.called
    stmt = mock_db.execute.call_args[0][0]
    sql_str = str(stmt)
    assert "ST_Contains" in sql_str
    assert "farmers.is_active" in sql_str
    assert "risk_grid_cells.risk_score >=" in sql_str


# =====================================================================
# 4. FASTAPI ENDPOINT INTEGRATION TESTS
# =====================================================================


@pytest.fixture
def mock_db_session():
    """Yield a mock database session and override get_db dependency."""
    session = MagicMock()
    # Mock refresh to set a random UUID if needed
    def _mock_refresh(instance):
        if not getattr(instance, "id", None):
            instance.id = uuid.uuid4()
    session.refresh.side_effect = _mock_refresh
    session.get.return_value = None

    app.dependency_overrides[get_db] = lambda: session
    yield session
    app.dependency_overrides.clear()


@pytest.fixture
def client(mock_db_session):
    """FastAPI TestClient fixture."""
    return TestClient(app)


def test_health_check(client):
    """Verify /health returns 200 OK."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "ecoshield"}


def test_post_farmers_endpoint(client, mock_db_session):
    """Verify POST /farmers creates a farmer with encrypted phone."""
    payload = {
        "phone_number": "+250788999888",
        "village_sector": "Kinigi",
        "latitude": -1.4850,
        "longitude": 29.5850,
        "is_active": True,
    }

    response = client.post("/farmers", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["village_sector"] == "Kinigi"
    assert data["latitude"] == -1.4850
    assert data["longitude"] == 29.5850
    assert "id" in data

    # Verify that add and commit were called on DB
    assert mock_db_session.add.called
    assert mock_db_session.commit.called
    added_farmer = mock_db_session.add.call_args[0][0]
    assert isinstance(added_farmer, Farmer)
    # The phone number stored in DB MUST be encrypted and decryptable
    assert added_farmer.phone_encrypted != "+250788999888"
    assert decrypt_field(added_farmer.phone_encrypted) == "+250788999888"


def test_post_predict_zone_endpoint(client, mock_db_session):
    """Verify POST /predict-zone generates grid, runs ML scoring, and saves cells."""
    payload = {
        "min_lon": 29.50,
        "min_lat": -1.50,
        "max_lon": 29.51,
        "max_lat": -1.49,
        "cell_size_m": 500,
        "trigger_alerts": False,
    }

    response = client.post("/predict-zone", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["total_cells"] > 0
    assert "high_risk_cells" in data
    assert mock_db_session.commit.called


def test_post_sightings_rbac(client, mock_db_session):
    """Verify POST /sightings requires JWT with ranger or admin role."""
    sighting_payload = {
        "species": "Elephant",
        "count": 3,
        "latitude": -1.4920,
        "longitude": 29.5210,
        "notes": "Spotted near perimeter fence.",
    }

    # 1. Missing Authorization header -> 401 Unauthorized
    res_no_auth = client.post("/sightings", json=sighting_payload)
    assert res_no_auth.status_code == 401

    # 2. Token with 'viewer' role -> 403 Forbidden
    viewer_token = create_access_token(subject="viewer_john", role=Role.VIEWER)
    res_viewer = client.post(
        "/sightings",
        json=sighting_payload,
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert res_viewer.status_code == 403

    # 3. Token with 'ranger' role -> 201 Created
    ranger_token = create_access_token(subject="ranger_samuel", role=Role.RANGER)
    res_ranger = client.post(
        "/sightings",
        json=sighting_payload,
        headers={"Authorization": f"Bearer {ranger_token}"},
    )
    assert res_ranger.status_code == 201
    data = res_ranger.json()
    assert data["species"] == "Elephant"
    assert data["count"] == 3
    assert data["logged_by"] == "ranger_samuel"
    assert "id" in data
    assert mock_db_session.add.called
    assert mock_db_session.commit.called
