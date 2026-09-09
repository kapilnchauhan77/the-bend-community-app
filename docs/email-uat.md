# The Bend email inventory and UAT plan

## Scope and evidence boundary

This is a read-only code inventory for BEND-43. It records seven reachable email paths in the application and a UAT plan. It does not send email, configure a provider, deploy the application, or prove inbox delivery.

The inventory audit started from commit [`6eb7cae4cb1e13de37673af2af848fec09dfaede`](https://github.com/kapilnchauhan77/the-bend-community-app/commit/6eb7cae4cb1e13de37673af2af848fec09dfaede). The source links resolve against the release branch.

The three priority link-template scenarios are:

- S1. Approval
- S2. Password reset
- S3. Listing interest

The seven reachable paths include those three priority scenarios plus registration confirmation, rejection, and the two referral messages. All three priority scenarios require `FRONTEND_URL` and localhost-fallback validation. A code inventory is evidence that a path and call exist. Unsent UAT is a plan only. Provider acceptance, if tested later, is not inbox delivery proof.

## Provider boundary

`EmailService._send` selects Resend when `RESEND_API_KEY` is configured, then SendGrid when only `SENDGRID_API_KEY` is configured. With neither key, it logs the recipient, subject, and first 100 characters of the body, then returns `False`. This logging is not development-guarded, so no-key mode is a production privacy and release concern. The provider response only establishes provider acceptance. It does not establish inbox delivery, spam placement, or link correctness. No provider key, credential, customer address, or synthetic secret belongs in this document.

Sources: [`email_service.py`](../the-bend-backend/app/services/email_service.py#L28), [`config.py`](../the-bend-backend/app/config.py#L46), [`config.py`](../the-bend-backend/app/config.py#L70).

## Reachable email paths

| Path | Trigger and recipient | Subject and body source | Current evidence |
|---|---|---|---|
| E1. Business registration received | `POST /auth/register`, only for `user_type == "business"`; sends to the submitted business email after persistence. | `send_registration_confirmation`; subject `Registration Received — The Bend`; escaped shop name and review message. | [`auth.py`](../the-bend-backend/app/api/v1/auth.py#L26), [`email_service.py`](../the-bend-backend/app/services/email_service.py#L83), [`test_registration_confirmation.py`](../the-bend-backend/tests/test_registration_confirmation.py#L54). |
| E2. Password reset | `POST /auth/forgot-password`; sends only for an existing user, to that user's email. Unknown addresses receive the same generic response and no send attempt. | `send_password_reset_email`; subject `Reset Your Password - The Bend Community`; named greeting, reset URL from `FRONTEND_URL` with localhost fallback, one-hour expiry. | [`auth.py`](../the-bend-backend/app/api/v1/auth.py#L69), [`auth_service.py`](../the-bend-backend/app/services/auth_service.py#L186), [`email_service.py`](../the-bend-backend/app/services/email_service.py#L104). |
| E3. Business registration approved | Community admin calls `POST /admin/registrations/{shop_id}/approve`; sends to the business admin's user email. | `send_registration_approved_email`; subject `Your Business is Approved - The Bend Community`; business name and login link. | [`admin.py`](../the-bend-backend/app/api/v1/admin.py#L100), [`admin_service.py`](../the-bend-backend/app/services/admin_service.py#L149), [`email_service.py`](../the-bend-backend/app/services/email_service.py#L135). |
| E4. Business registration rejected | Community admin calls `POST /admin/registrations/{shop_id}/reject` with a reason; sends to the business admin's user email. | `send_registration_rejected_email`; subject `Registration Update - The Bend Community`; business name and supplied reason. | [`admin.py`](../the-bend-backend/app/api/v1/admin.py#L110), [`admin_service.py`](../the-bend-backend/app/services/admin_service.py#L178), [`email_service.py`](../the-bend-backend/app/services/email_service.py#L163). |
| E5. Listing interest notification | `POST /interests` requires `Permission.require_shop_admin()` and sends to the listing owner's user email. The service does not enforce that the listing is active. | `send_interest_notification_email`; subject includes the listing title; owner greeting, listing title, and `/my-shop` link. | [`shops.py`](../the-bend-backend/app/api/v1/shops.py#L490), [`interest_service.py`](../the-bend-backend/app/services/interest_service.py#L21), [`ListingDetailPage.tsx`](../the-bend-frontend/src/pages/ListingDetailPage.tsx#L140), [`email_service.py`](../the-bend-backend/app/services/email_service.py#L189). |
| E6. Referral warm introduction | Community admin submits `POST /referrals`; sends best-effort to the referred email after referral creation. | `send_referral_intro_email`; subject includes referrer name and county-fit wording, with an optional submitted note. | [`referrals.py`](../the-bend-backend/app/api/v1/referrals.py#L42), [`email_service.py`](../the-bend-backend/app/services/email_service.py#L216). |
| E7. Referral status update | Super admin advances `POST /super-admin/referrals/{referral_id}/advance`; sends to the referring user's email. | `send_referral_status_email`; status labels cover `pending`, `contacted`, `demo_scheduled`, `launched`, and `expired`. A reward block appears only for `launched` with a reward amount. | [`super_admin.py`](../the-bend-backend/app/api/v1/super_admin.py#L141), [`email_service.py`](../the-bend-backend/app/services/email_service.py#L233). |

The approval, rejection, and listing-interest paths also create separate in-app notifications. Duplicate-interest conflict and withdraw paths do not send a new email. Mail failures are best-effort on the live paths and do not turn the related saved action into a failed API response.

## Inactive or incomplete email-looking code

- I1. [`email_tasks.py`](../the-bend-backend/app/workers/email_tasks.py#L6) defines Celery email tasks, but repository search found no `.delay()` or `.apply_async()` caller. Live endpoints call `email_service` directly. Treat these tasks and their legacy simple templates as inactive until an enqueue caller exists.
- I2. [`digest.py`](../the-bend-backend/app/api/v1/digest.py#L16) returns weekly digest data but does not send email. [`celery_app.py`](../the-bend-backend/app/workers/celery_app.py#L21) schedules listing expiry and cleanup jobs only.
- I3. The Settings page shows an email daily-digest toggle, but [`SettingsPage.tsx`](../the-bend-frontend/src/pages/SettingsPage.tsx#L846) simulates saving. The preferences endpoint calls a no-op service method in [`notifications.py`](../the-bend-backend/app/api/v1/notifications.py#L91) and [`notification_service.py`](../the-bend-backend/app/services/notification_service.py#L69). In-app notification writes in [`notification_service.py`](../the-bend-backend/app/services/notification_service.py#L39) are separate from email.

## Unsent UAT plan

Use a dedicated synthetic mailbox and a provider test account or safe staging provider configuration. Never use real member contact details. Capture only the API response, provider event or message ID when available, recipient category, subject, and a redacted body summary.

- A1. Approval: create a synthetic pending business, approve it, and confirm one approval message to that business admin. Confirm the matching in-app notification and that a provider failure does not produce a 5xx.
- A2. Password reset: request a reset for an existing synthetic account. Confirm the generic response, one message, a deployed non-localhost URL, and that the stateless JWT token remains reusable until its one-hour expiry. Request an unknown address and confirm the same response with no message. One-time use is unmet.
- A3. Listing interest: use an eligible synthetic business/shop-admin actor to express interest in an active listing. Confirm one owner message and one in-app notification. Repeat or withdraw and confirm no duplicate send.
- A4. Reachable-path checks: use synthetic recipients for registration confirmation, rejection, referral introduction, and referral status updates. Confirm persistence and the documented recipient for each path without sending to a real customer.
- A5. Provider modes: in non-production, test Resend configured, SendGrid-only configured, and neither configured. Confirm precedence and that no-key mode returns `False` while logging the recipient, subject, and body prefix. Do not use customer data in this check.
- A6. Negative scope: exercise new message, event submission, listing report, shop suspension, and notification-preference changes. Confirm in-app state only. The daily-digest toggle must not be treated as scheduled email.

No BEND-43 email send is required for this release.

## Release concerns

- R1. A successful API response or provider acceptance is not inbox delivery proof. UAT needs provider and mailbox evidence if the product later authorizes a send.
- R2. Password reset, approval, and listing-interest links use `FRONTEND_URL` and fall back to `http://localhost:5173` when the setting is absent. A production message containing that fallback is a release defect.
- R3. Newer HTML templates do not escape every dynamic value. UAT should use harmless markup-like synthetic names, titles, notes, and rejection reasons and inspect the rendered message.
- R4. No-key mode logs recipient, subject, and body prefix without a development guard. Treat this as a production privacy and release concern.
- R5. Reset tokens are reusable stateless JWTs until their one-hour expiry. One-time use is not implemented and remains an unmet security concern.
