"""Push notification background tasks."""
import logging
from app.workers.celery_app import celery_app
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def _send_push(subscription_info: dict, title: str, body: str, data: dict | None = None):
    if not settings.VAPID_PRIVATE_KEY:
        logger.info(f"[DEV PUSH] Title: {title} | Body: {body}")
        return
    try:
        from pywebpush import webpush
        import json
        payload = json.dumps({"title": title, "body": body, "data": data or {}})
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"},
        )
    except Exception as e:
        logger.error(f"Push notification failed: {e}")


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def push_new_message(self, subscription_info: dict, sender_name: str, shop_name: str):
    try:
        _send_push(subscription_info, f"New message from {shop_name}", f"{sender_name} sent you a message")
    except Exception as exc:
        self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def push_listing_interest(self, subscription_info: dict, shop_name: str, listing_title: str):
    try:
        _send_push(subscription_info, f"{shop_name} is interested", f"Interest in: {listing_title}")
    except Exception as exc:
        self.retry(exc=exc)


@celery_app.task
def push_critical_listing(subscription_info: dict, title: str, shop_name: str):
    _send_push(subscription_info, f"🔴 {title}", f"Critical listing by {shop_name}")


@celery_app.task
def push_urgent_listing(subscription_info: dict, title: str, shop_name: str):
    _send_push(subscription_info, f"🟡 {title}", f"Urgent listing by {shop_name}")


@celery_app.task
def push_registration_decision(subscription_info: dict, approved: bool, shop_name: str):
    if approved:
        _send_push(subscription_info, "Registration Approved!", f"{shop_name} is now active on The Bend")
    else:
        _send_push(subscription_info, "Registration Update", f"Your registration for {shop_name} has been reviewed")
