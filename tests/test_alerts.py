"""Unit tests for Celery task configuration and alert service."""

from unittest.mock import MagicMock, patch
import uuid
from datetime import date

import pytest
from celery.schedules import crontab

from app.services.celery_app import celery_app, execute_daily_batch_pipeline
from app.services.alert_service import _format_alert_sms, send_sms, run_batch_alerts
from app.core.security import encrypt_field


def test_celery_configuration():
    """Verify Celery broker, backend, and beat schedule."""
    assert "redis" in celery_app.conf.broker_url
    assert "execute_daily_batch_pipeline" in celery_app.conf.beat_schedule
    schedule = celery_app.conf.beat_schedule["execute_daily_batch_pipeline"]["schedule"]
    assert isinstance(schedule, crontab)
    assert schedule.hour == {4}
    assert schedule.minute == {0}


def test_sms_formatting():
    """Verify formatted SMS text matches specification."""
    cell_id = "ZONE_101"
    risk_score = 0.824
    sms = _format_alert_sms(cell_id, risk_score)
    expected = (
        "⚠️ EcoShield Alert: High wildlife movement risk predicted "
        "near Zone ZONE_101 tonight (82%). Secure livestock and prepare light deterrents."
    )
    assert sms == expected


def test_send_sms_mock_fallback():
    """Verify that send_sms generates a mock SID when credentials are placeholders."""
    sid, status = send_sms("+250788123456", "Test alert")
    assert sid.startswith("mock-")
    assert status == "sent"


@patch("app.services.alert_service.SessionLocal")
@patch("app.services.alert_service.query_farmers_in_risk_zones")
def test_run_batch_alerts_pipeline(mock_query, mock_session_local):
    """Test the full batch alerting logic with mocked DB session and spatial query."""
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db

    # Mock Farmer and Cell
    mock_farmer = MagicMock()
    mock_farmer.id = uuid.uuid4()
    mock_farmer.phone_encrypted = encrypt_field("+250788000111")

    mock_cell = MagicMock()
    mock_cell.cell_id = "CELL_01"
    mock_cell.risk_score = 0.88

    mock_query.return_value = [(mock_farmer, mock_cell)]

    summary = run_batch_alerts(target_date=date.today(), risk_threshold=0.75)

    assert summary["matches"] == 1
    assert summary["sent"] == 1
    assert summary["failed"] == 0
    assert mock_db.commit.called
    assert mock_db.close.called
