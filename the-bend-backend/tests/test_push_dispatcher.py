from uuid import uuid4

import pytest

from app.models.enums import NotificationType
from app.services.push_provider import ProviderResult
from app.services.push_provider import provider_for_platform
from app.services.push_dispatcher import CATEGORY_SPECS, build_native_payload


def test_generic_message_payload_never_includes_stored_message_or_arbitrary_data():
    notification = type(
        "NotificationStub",
        (),
        {
            "id": uuid4(),
            "type": NotificationType.NEW_MESSAGE,
            "body": "secret message body",
            "data": {"message": "secret message body", "contact": "555-0100", "target_type": "message", "target_id": str(uuid4())},
        },
    )()

    payload = build_native_payload(notification)

    assert payload["body"] == "You have a new message"
    assert "secret message body" not in str(payload)
    assert set(payload) == {"notification_id", "category", "title", "body", "target_type", "target_id"}


def test_all_supported_notification_types_have_generic_category_mapping():
    expected = {
        NotificationType.NEW_MESSAGE: "message_received",
        NotificationType.LISTING_INTEREST: "listing_interest_received",
        NotificationType.REGISTRATION_APPROVED: "registration_decision",
        NotificationType.REGISTRATION_REJECTED: "registration_decision",
        NotificationType.NEW_URGENT_LISTING: "urgent_listing_published",
    }
    assert set(expected.values()) == {spec.category for spec in CATEGORY_SPECS.values()}


def test_provider_result_is_sanitized_and_code_only():
    result = ProviderResult.transient("provider_timeout: token=secret")
    assert result.kind == "transient"
    assert result.code == "provider_timeout"
    assert "secret" not in repr(result)


def test_unsupported_notification_type_has_no_native_payload():
    notification = type("NotificationStub", (), {"id": uuid4(), "type": NotificationType.LISTING_EXPIRING, "data": {}})()
    assert build_native_payload(notification) is None


def test_payload_ignores_non_string_target_type_without_raising():
    notification = type("NotificationStub", (), {"id": uuid4(), "type": NotificationType.NEW_MESSAGE, "data": {"target_type": [], "target_id": {}}})()
    payload = build_native_payload(notification)
    assert payload == {"notification_id": str(notification.id), "category": "message_received", "title": "New message", "body": "You have a new message"}


@pytest.mark.asyncio
@pytest.mark.parametrize(("description", "expected"), [("DeviceTokenNotForTopic", "invalid_token"), ("TooManyRequests", "transient"), ("PayloadEmpty", "permanent")])
async def test_apns_maps_installed_response_description(monkeypatch, description, expected):
    from app.services.push_provider import APNsProvider

    class Response:
        is_successful = False
        status = 400

        def __init__(self):
            self.description = description

    class Client:
        def __init__(self, **kwargs):
            pass

        async def send_notification(self, request):
            return Response()

    monkeypatch.setattr("aioapns.APNs", Client)
    provider = APNsProvider(type("Settings", (), {"APNS_TEAM_ID": "team", "APNS_KEY_ID": "key", "APNS_PRIVATE_KEY": "private", "APNS_BUNDLE_ID": "bundle", "APNS_USE_SANDBOX": False})())
    result = await provider.send(type("Installation", (), {"provider_token": "token"})(), {"title": "T", "body": "B"})
    assert result.kind == expected


def test_provider_routing_is_platform_specific_without_network():
    assert provider_for_platform("ios").__class__.__name__ == "APNsProvider"
    assert provider_for_platform("android").__class__.__name__ == "FCMProvider"
    assert provider_for_platform("web") is None


def test_celery_registration_and_ten_second_beat_entry():
    from app.workers.celery_app import celery_app
    import app.workers.push_tasks  # noqa: F401

    assert "app.workers.push_tasks.dispatch_push_outbox" in celery_app.tasks
    assert celery_app.conf.beat_schedule["dispatch-push-outbox"]["schedule"].run_every.total_seconds() == 10


@pytest.mark.asyncio
async def test_provider_imports_without_credentials():
    from app.services.push_provider import APNsProvider, FCMProvider

    assert APNsProvider is not None
    assert FCMProvider is not None
