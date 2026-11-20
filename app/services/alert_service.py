"""Alert dispatch service – spatial join, SMS delivery, and audit logging.

Pipeline
--------
1. Query ``risk_grid_cells`` for today where ``risk_score ≥ 0.75``.
2. For each high-risk cell, find active farmers whose
   ``location_geom`` falls inside the cell polygon (``ST_Contains``).
3. Decrypt the farmer's phone number in-memory.
4. Send an SMS via Twilio REST API.
5. Write an ``AlertDispatchLog`` row for every attempt.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

from geoalchemy2.functions import ST_Contains
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import decrypt_field
from app.db.models import AlertDispatchLog, Farmer, RiskGridCell

logger = logging.getLogger(__name__)

# ── Twilio client (lazy) ─────────────────────────────────────────────────

_twilio_client: Any | None = None


def _get_twilio_client():
    """Lazy-initialise the Twilio REST client."""
    global _twilio_client
    if _twilio_client is None:
        from twilio.rest import Client

        settings = get_settings()
        _twilio_client = Client(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
        )
    return _twilio_client


# ── SMS formatting ───────────────────────────────────────────────────────

_SMS_TEMPLATE = (
    "\u26a0\ufe0f EcoShield Alert: High wildlife movement risk predicted "
    "near Zone {cell_id} tonight ({risk_pct}%). "
    "Secure livestock and prepare light deterrents."
)


def _format_alert_sms(cell_id: str, risk_score: float) -> str:
    """Build the human-readable SMS body."""
    risk_pct = round(risk_score * 100)
    return _SMS_TEMPLATE.format(cell_id=cell_id, risk_pct=risk_pct)


# ── Core query: PostGIS spatial join ─────────────────────────────────────


def query_farmers_in_risk_zones(
    db: Session,
    target_date: date | None = None,
    risk_threshold: float = 0.75,
) -> list[tuple[Farmer, RiskGridCell]]:
    """Return (farmer, cell) pairs where the farmer's location falls
    inside a high-risk grid cell for *target_date*.

    Uses ``ST_Contains(cell.geom, farmer.location_geom)`` to perform the
    spatial join entirely inside PostGIS.
    """
    if target_date is None:
        target_date = date.today()

    stmt = (
        select(Farmer, RiskGridCell)
        .where(
            and_(
                Farmer.is_active.is_(True),
                RiskGridCell.prediction_date == target_date,
                RiskGridCell.risk_score >= risk_threshold,
                ST_Contains(
                    RiskGridCell.geom,
                    Farmer.location_geom,
                ),
            )
        )
    )

    results: list[tuple[Farmer, RiskGridCell]] = list(db.execute(stmt).all())
    logger.info(
        "Spatial join found %d farmer×cell matches for %s (threshold=%.2f)",
        len(results),
        target_date,
        risk_threshold,
    )
    return results


# ── SMS dispatch ─────────────────────────────────────────────────────────


def send_sms(phone_number: str, body: str) -> tuple[str, str]:
    """Send an SMS via Twilio and return ``(sid, status)``.

    Returns ``("mock-sid", "sent")`` if Twilio credentials are
    placeholders (local dev / CI).
    """
    settings = get_settings()

    # Guard: skip real dispatch when using placeholder credentials
    if settings.TWILIO_ACCOUNT_SID.startswith("your_"):
        logger.warning(
            "Twilio credentials are placeholders – simulating SMS to %s",
            phone_number[-4:].rjust(len(phone_number), "*"),
        )
        return (f"mock-{uuid.uuid4().hex[:12]}", "sent")

    try:
        client = _get_twilio_client()
        message = client.messages.create(
            body=body,
            from_=settings.TWILIO_PHONE_NUMBER,
            to=phone_number,
        )
        logger.info("SMS dispatched  sid=%s  to=%s", message.sid, phone_number[-4:])
        return (message.sid, message.status)
    except Exception:
        logger.exception("Twilio SMS dispatch failed for %s", phone_number[-4:])
        return ("", "failed")


# ── Audit logging ────────────────────────────────────────────────────────


def _log_dispatch(
    db: Session,
    farmer: Farmer,
    cell: RiskGridCell,
    delivery_status: str,
) -> AlertDispatchLog:
    """Insert an audit row into ``alert_dispatch_logs``."""
    log_entry = AlertDispatchLog(
        cell_id=cell.cell_id,
        farmer_id=farmer.id,
        risk_score=cell.risk_score,
        dispatched_at=datetime.now(timezone.utc),
        delivery_status=delivery_status,
    )
    db.add(log_entry)
    return log_entry


# ── Batch orchestrator ───────────────────────────────────────────────────


def run_batch_alerts(
    target_date: date | None = None,
    risk_threshold: float = 0.75,
) -> dict[str, Any]:
    """Execute the full alert pipeline for *target_date*.

    Called by the Celery beat task ``execute_daily_batch_pipeline``.

    Returns
    -------
    dict with keys ``date``, ``matches``, ``sent``, ``failed``.
    """
    if target_date is None:
        target_date = date.today()

    db: Session = SessionLocal()
    sent = 0
    failed = 0

    try:
        matches = query_farmers_in_risk_zones(db, target_date, risk_threshold)

        if not matches:
            logger.info("No high-risk farmer matches for %s – nothing to dispatch.", target_date)
            return {
                "date": str(target_date),
                "matches": 0,
                "sent": 0,
                "failed": 0,
            }

        for farmer, cell in matches:
            # 1. Decrypt phone in-memory (never persisted in plaintext)
            try:
                phone = decrypt_field(farmer.phone_encrypted)
            except ValueError:
                logger.error(
                    "Cannot decrypt phone for farmer %s – skipping.",
                    farmer.id,
                )
                _log_dispatch(db, farmer, cell, "failed")
                failed += 1
                continue

            # 2. Format & send SMS
            body = _format_alert_sms(cell.cell_id, cell.risk_score)
            _sid, status = send_sms(phone, body)

            # 3. Audit log
            delivery = "sent" if status != "failed" else "failed"
            _log_dispatch(db, farmer, cell, delivery)

            if delivery == "sent":
                sent += 1
            else:
                failed += 1

        db.commit()

        summary = {
            "date": str(target_date),
            "matches": len(matches),
            "sent": sent,
            "failed": failed,
        }
        logger.info("Batch alert summary: %s", summary)
        return summary

    except Exception:
        db.rollback()
        logger.exception("Batch alert pipeline failed for %s", target_date)
        raise
    finally:
        db.close()
