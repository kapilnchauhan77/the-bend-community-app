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
            return False
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
            response = sg.send(message)
            print(f"[EMAIL] Sent: {subject} -> {to_email} (status: {response.status_code})")
            return response.status_code in (200, 201, 202)
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

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

    def send_password_reset_email(self, to_email: str, reset_token: str, user_name: str):
        """Send styled password reset email with user's name."""
        frontend_url = getattr(settings, 'FRONTEND_URL', None) or "http://localhost:5173"
        reset_url = f"{frontend_url}/reset-password?token={reset_token}"
        html = f"""
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2d6a3f; font-size: 24px; margin: 0;">The Bend Community</h1>
            </div>
            <h2 style="color: #333; font-size: 20px;">Reset Your Password</h2>
            <p style="color: #555; line-height: 1.6;">Hi {user_name},</p>
            <p style="color: #555; line-height: 1.6;">
                We received a request to reset your password. Click the button below to set a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_url}"
                   style="background-color: #2d6a3f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                    Reset Password
                </a>
            </div>
            <p style="color: #888; font-size: 13px; line-height: 1.5;">
                If you didn't request this, you can safely ignore this email. This link expires in 1 hour.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e0d8; margin: 30px 0;" />
            <p style="color: #aaa; font-size: 11px; text-align: center;">
                &copy; 2026 The Bend Community &middot; Operated by ProLine Online Group
            </p>
        </div>
        """
        return self._send(to_email, "Reset Your Password - The Bend Community", html)

    def send_registration_approved_email(self, to_email: str, user_name: str, shop_name: str):
        """Send styled registration approved notification."""
        frontend_url = getattr(settings, 'FRONTEND_URL', None) or "http://localhost:5173"
        html = f"""
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2d6a3f; font-size: 24px; margin: 0;">The Bend Community</h1>
            </div>
            <h2 style="color: #333; font-size: 20px;">Welcome to The Bend!</h2>
            <p style="color: #555; line-height: 1.6;">Hi {user_name},</p>
            <p style="color: #555; line-height: 1.6;">
                Great news! Your business <strong>{shop_name}</strong> has been approved.
                You can now post listings, connect with neighbors, and start sharing resources.
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{frontend_url}/login"
                   style="background-color: #2d6a3f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                    Log In Now
                </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e5e0d8; margin: 30px 0;" />
            <p style="color: #aaa; font-size: 11px; text-align: center;">
                &copy; 2026 The Bend Community &middot; Operated by ProLine Online Group
            </p>
        </div>
        """
        return self._send(to_email, "Your Business is Approved - The Bend Community", html)

    def send_registration_rejected_email(self, to_email: str, user_name: str, shop_name: str, reason: str):
        """Send styled registration rejected notification."""
        html = f"""
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2d6a3f; font-size: 24px; margin: 0;">The Bend Community</h1>
            </div>
            <h2 style="color: #333; font-size: 20px;">Registration Update</h2>
            <p style="color: #555; line-height: 1.6;">Hi {user_name},</p>
            <p style="color: #555; line-height: 1.6;">
                We were unable to approve your business <strong>{shop_name}</strong> at this time.
            </p>
            <p style="color: #555; line-height: 1.6;">
                <strong>Reason:</strong> {reason}
            </p>
            <p style="color: #555; line-height: 1.6;">
                If you have questions, please contact us at support@proline-online.com.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e0d8; margin: 30px 0;" />
            <p style="color: #aaa; font-size: 11px; text-align: center;">
                &copy; 2026 The Bend Community &middot; Operated by ProLine Online Group
            </p>
        </div>
        """
        return self._send(to_email, "Registration Update - The Bend Community", html)

    def send_interest_notification_email(self, to_email: str, owner_name: str, listing_title: str):
        """Send notification when someone expresses interest."""
        frontend_url = getattr(settings, 'FRONTEND_URL', None) or "http://localhost:5173"
        html = f"""
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2d6a3f; font-size: 24px; margin: 0;">The Bend Community</h1>
            </div>
            <h2 style="color: #333; font-size: 20px;">Someone is Interested!</h2>
            <p style="color: #555; line-height: 1.6;">Hi {owner_name},</p>
            <p style="color: #555; line-height: 1.6;">
                A community member expressed interest in your listing: <strong>{listing_title}</strong>
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{frontend_url}/my-shop"
                   style="background-color: #2d6a3f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                    View My Business
                </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e5e0d8; margin: 30px 0;" />
            <p style="color: #aaa; font-size: 11px; text-align: center;">
                &copy; 2026 The Bend Community &middot; Operated by ProLine Online Group
            </p>
        </div>
        """
        return self._send(to_email, f"Interest in '{listing_title}' - The Bend Community", html)


email_service = EmailService()
