"""Celery application configuration."""
from celery import Celery
from celery.schedules import crontab, schedule
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "thebend",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=(
        "app.workers.push_tasks",
        "app.workers.account_tasks",
        "app.workers.scheduled_tasks",
        "app.workers.email_tasks",
    ),
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
        "dispatch-push-outbox": {
            "task": "app.workers.push_tasks.dispatch_push_outbox",
            "schedule": schedule(10.0),
        },
        "reconcile-account-deletions": {
            "task": "app.workers.account_tasks.reconcile_account_deletions",
            "schedule": schedule(30.0),
        },
    },
)

celery_app.autodiscover_tasks(["app.workers"])

# These modules intentionally do not use Celery's conventional ``tasks.py``
# filename. Import them after the app is fully configured so a bare
# ``from app.workers.celery_app import celery_app`` (the worker entrypoint)
# has the same registry as a Celery worker process.
from app.workers import account_tasks as _account_tasks  # noqa: F401,E402
from app.workers import push_tasks as _push_tasks  # noqa: F401,E402
from app.workers import scheduled_tasks as _scheduled_tasks  # noqa: F401,E402
from app.workers import email_tasks as _email_tasks  # noqa: F401,E402
