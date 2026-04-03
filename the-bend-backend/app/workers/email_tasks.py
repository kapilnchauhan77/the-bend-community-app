"""Email background tasks."""
from app.workers.celery_app import celery_app
from app.services.email_service import email_service


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_registration_confirmation(self, to_email: str, shop_name: str):
    try:
        email_service.send_registration_confirmation(to_email, shop_name)
    except Exception as exc:
        self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_approval_email(self, to_email: str, shop_name: str):
    try:
        email_service.send_approval_email(to_email, shop_name)
    except Exception as exc:
        self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_rejection_email(self, to_email: str, shop_name: str, reason: str):
    try:
        email_service.send_rejection_email(to_email, shop_name, reason)
    except Exception as exc:
        self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset(self, to_email: str, reset_token: str):
    try:
        email_service.send_password_reset(to_email, reset_token)
    except Exception as exc:
        self.retry(exc=exc)


@celery_app.task
def send_daily_digest(to_email: str, listings_count: int, requests_count: int):
    email_service.send_daily_digest(to_email, listings_count, requests_count)
