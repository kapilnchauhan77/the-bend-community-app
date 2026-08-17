"""Email service.

Sends via Resend (preferred) or SendGrid (fallback), and logs to the console
in development when no provider key is configured. Provider errors are logged
with the provider's response body so failures are never silent — a dead
provider previously returned False and callers proceeded as if the mail sent.
"""
import logging
import httpx
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.resend_api_key = settings.RESEND_API_KEY
        self.sendgrid_api_key = settings.SENDGRID_API_KEY
        self.from_email = settings.EMAIL_FROM
        self.from_name = settings.EMAIL_FROM_NAME

    @property
    def _from(self) -> str:
        return f"{self.from_name} <{self.from_email}>"

    def _send(self, to_email: str, subject: str, body: str) -> bool:
        if self.resend_api_key:
            return self._send_resend(to_email, subject, body)
        if self.sendgrid_api_key:
            return self._send_sendgrid(to_email, subject, body)
        logger.info(f"[DEV EMAIL] To: {to_email} | Subject: {subject} | Body: {body[:100]}...")
        return False

    def _send_resend(self, to_email: str, subject: str, body: str) -> bool:
        try:
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {self.resend_api_key}"},
                json={
                    "from": self._from,
                    "to": [to_email],
                    "subject": subject,
                    "html": body,
                },
                timeout=15.0,
            )
            if resp.status_code in (200, 201, 202):
                print(f"[EMAIL] Sent via Resend: {subject} -> {to_email}")
                return True
            logger.error(
                f"Resend failed to send to {to_email}: HTTP {resp.status_code} {resp.text[:300]}"
            )
            return False
        except Exception as e:
            logger.error(f"Resend error sending to {to_email}: {e}")
            return False

    def _send_sendgrid(self, to_email: str, subject: str, body: str) -> bool:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            message = Mail(
                from_email=(self.from_email, self.from_name),
                to_emails=to_email,
                subject=subject,
                html_content=body,
            )
            sg = SendGridAPIClient(self.sendgrid_api_key)
            response = sg.send(message)
            if response.status_code in (200, 201, 202):
                print(f"[EMAIL] Sent via SendGrid: {subject} -> {to_email}")
                return True
            logger.error(
                f"SendGrid failed to send to {to_email}: HTTP {response.status_code} {getattr(response, 'body', b'')[:300]}"
            )
            return False
        except Exception as e:
            logger.error(f"SendGrid error sending to {to_email}: {e}")
            return False

    def send_registration_confirmation(self, to_email: str, shop_name: str):
        self._send(to_email, "Registration Received — The Bend",
            f"<h2>Welcome to The Bend!</h2><p>Your registration for <strong>{shop_name}</strong> has been received. The community admin will review your application shortly.</p>")

    def send_account_deletion_confirmation(self, to_email: str) -> bool:
        return bool(self._send(to_email, "Account deletion complete — The Bend",
            "<h2>Account deletion complete</h2><p>Your Bend account and personal data have been removed.</p>"))

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

    def send_referral_intro_email(self, to_email, referred_name, referrer_name, referrer_county, note=None):
        note_block = (
            f'<blockquote style="border-left:3px solid #c8a96a;margin:16px 0;padding:8px 16px;color:#555;font-style:italic;">{note}</blockquote>'
            if note else ''
        )
        html = f"""<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:40px 20px;">
            <h1 style="color:#2d6a3f;font-size:22px;text-align:center;margin:0 0 20px;">The Bend Community</h1>
            <h2 style="color:#333;">Hi {referred_name},</h2>
            <p style="color:#555;line-height:1.7;"><strong>{referrer_name}</strong> from <strong>{referrer_county}</strong> thinks The Bend would be a great fit for your county.</p>
            {note_block}
            <p style="color:#555;line-height:1.7;">The Bend is a hyper-local marketplace platform that lets neighboring businesses share gigs, surplus materials, equipment, and volunteer time — built per-county with your branding, your subdomain, and seeded with your local businesses.</p>
            <p style="color:#555;line-height:1.7;">If you'd like to see how it works, reply to this email and we'll set up a 20-minute demo.</p>
            <p style="color:#555;line-height:1.7;margin-top:24px;">— The Bend Community team</p>
            <p style="text-align:center;color:#aaa;font-size:11px;margin-top:40px;">You're receiving this because {referrer_name} referred you.</p>
        </div>"""
        return self._send(to_email, f"{referrer_name} thinks The Bend is a fit for your county", html)

    def send_referral_status_email(self, to_email, referrer_name, referred_county_name, new_status, reward_months=None):
        status_label = {
            "pending": "received",
            "contacted": "contacted",
            "demo_scheduled": "scheduled for a demo",
            "launched": "launched",
            "expired": "closed (no response)",
        }.get(new_status, new_status)

        reward_block = ""
        if new_status == "launched" and reward_months:
            reward_block = f"""<div style="background:#f4ecd8;border:1px solid #c8a96a;padding:16px;border-radius:6px;margin:24px 0;">
                <p style="margin:0;color:#5a4a2a;font-weight:bold;">Reward earned</p>
                <p style="margin:8px 0 0;color:#5a4a2a;">{reward_months} months of free platform fees on your tenant.</p>
            </div>"""

        html = f"""<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:40px 20px;">
            <h1 style="color:#2d6a3f;font-size:22px;text-align:center;margin:0 0 20px;">The Bend Community</h1>
            <h2 style="color:#333;">Hi {referrer_name},</h2>
            <p style="color:#555;line-height:1.7;">Quick update on your referral for <strong>{referred_county_name}</strong>: we've just <strong>{status_label}</strong> them.</p>
            {reward_block}
            <p style="color:#555;line-height:1.7;">Thanks for helping grow the community.</p>
            <p style="color:#555;line-height:1.7;margin-top:24px;">— The Bend Community team</p>
        </div>"""
        return self._send(to_email, f"Your referral update — {referred_county_name}", html)


email_service = EmailService()
