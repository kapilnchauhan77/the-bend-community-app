"""Email service - uses SendGrid in production, logs in development."""
import logging
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.api_key = settings.SENDGRID_API_KEY
        self.from_email = settings.EMAIL_FROM
        self.from_name = settings.EMAIL_FROM_NAME

    def _send(self, to_email: str, subject: str, body: str):
        if not self.api_key:
            logger.info(f"[DEV EMAIL] To: {to_email} | Subject: {subject} | Body: {body[:100]}...")
            return
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            message = Mail(
                from_email=(self.from_email, self.from_name),
                to_emails=to_email,
                subject=subject,
                html_content=body,
            )
            sg = SendGridAPIClient(self.api_key)
            sg.send(message)
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")

    def send_registration_confirmation(self, to_email: str, shop_name: str):
        self._send(to_email, "Registration Received — The Bend",
            f"<h2>Welcome to The Bend!</h2><p>Your registration for <strong>{shop_name}</strong> has been received. The community admin will review your application shortly.</p>")

    def send_approval_email(self, to_email: str, shop_name: str):
        self._send(to_email, "You're In! — The Bend",
            f"<h2>Congratulations!</h2><p>Your shop <strong>{shop_name}</strong> has been approved. <a href='http://localhost:5173/login'>Log in</a> to start sharing resources with your neighbors.</p>")

    def send_rejection_email(self, to_email: str, shop_name: str, reason: str):
        self._send(to_email, "Registration Update — The Bend",
            f"<h2>Registration Update</h2><p>Unfortunately, your registration for <strong>{shop_name}</strong> was not approved.</p><p><strong>Reason:</strong> {reason}</p><p>Please contact the community admin for more information.</p>")

    def send_password_reset(self, to_email: str, reset_token: str):
        reset_url = f"http://localhost:5173/reset-password?token={reset_token}"
        self._send(to_email, "Password Reset — The Bend",
            f"<h2>Password Reset</h2><p>Click the link below to reset your password (expires in 1 hour):</p><p><a href='{reset_url}'>{reset_url}</a></p>")

    def send_daily_digest(self, to_email: str, listings_count: int, requests_count: int):
        self._send(to_email, "Daily Digest — The Bend",
            f"<h2>Today on The Bend</h2><p><strong>{listings_count}</strong> new listings and <strong>{requests_count}</strong> new requests were posted. <a href='http://localhost:5173/browse'>Browse now</a>.</p>")


email_service = EmailService()
