"""Celery application configuration.

Broker and result backend use Redis (``REDIS_URL`` from ``.env``).
A daily beat schedule triggers the batch risk-alert pipeline at 04:00 AM.
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

# ── Celery application ───────────────────────────────────────────────────

celery_app = Celery(
    "ecoshield",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="Africa/Kigali",
    enable_utc=True,

    # Reliability
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,

    # Result expiry (24 h)
    result_expires=86_400,
)

# ── Beat schedule ────────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    "execute_daily_batch_pipeline": {
        "task": "app.services.celery_app.execute_daily_batch_pipeline",
        "schedule": crontab(hour=4, minute=0),  # 04:00 AM daily
        "options": {"queue": "alerts"},
    },
}

# ── Tasks ────────────────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    name="app.services.celery_app.execute_daily_batch_pipeline",
    max_retries=3,
    default_retry_delay=300,  # 5 minutes between retries
    acks_late=True,
)
def execute_daily_batch_pipeline(self) -> dict:
    """Run the full daily risk-alert pipeline.

    Steps
    -----
    1. Query high-risk grid cells for today (risk_score ≥ 0.75).
    2. Spatial-join with active farmers (ST_Contains).
    3. Decrypt phone numbers and dispatch Twilio SMS alerts.
    4. Log every dispatch into ``alert_dispatch_logs``.

    Returns a summary dict with counts.
    """
    # Import here to avoid circular imports at module level.
    from app.services.alert_service import run_batch_alerts

    try:
        summary = run_batch_alerts()
        return summary
    except Exception as exc:
        # Retry on transient errors (network, DB timeout, etc.)
        raise self.retry(exc=exc)
