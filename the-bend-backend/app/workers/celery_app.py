"""Celery application configuration."""
from celery import Celery
from celery.schedules import crontab
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "thebend",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "check-expiring-listings": {
            "task": "app.workers.scheduled_tasks.check_expiring_listings",
            "schedule": crontab(minute=0),  # Every hour
        },
        "auto-expire-listings": {
            "task": "app.workers.scheduled_tasks.auto_expire_listings",
            "schedule": crontab(minute=30),  # Every hour at :30
        },
        "auto-expire-old-listings": {
            "task": "app.workers.scheduled_tasks.auto_expire_old_listings",
            "schedule": crontab(hour=0, minute=0),  # Daily midnight
        },
        "cleanup-read-notifications": {
            "task": "app.workers.scheduled_tasks.cleanup_read_notifications",
            "schedule": crontab(hour=3, minute=0, day_of_week=0),  # Weekly Sunday 3 AM
        },
    },
)

celery_app.autodiscover_tasks(["app.workers"])
