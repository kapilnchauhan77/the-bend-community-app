"""Unit tests for EmailService provider routing and failure surfacing.

These lock in the fix for the outage where SendGrid returned HTTP 401
("Maximum credits exceeded") on every send: the app must (a) prefer Resend,
and (b) never treat a failed send as anything but a logged failure.
"""
import logging

import httpx
import pytest

from app.services.email_service import EmailService


class _FakeResponse:
    def __init__(self, status_code: int, text: str = ""):
        self.status_code = status_code
        self.text = text


@pytest.fixture
def svc():
    s = EmailService()
    # Isolate from real environment config.
    s.resend_api_key = ""
    s.sendgrid_api_key = ""
    s.from_email = "support@bend.community"
    s.from_name = "The Bend Community"
    return s


def test_uses_resend_when_key_set(svc, monkeypatch):
    """With a Resend key, _send must POST to the Resend API (not SendGrid).

    Fails against the pre-fix code, which had no Resend path at all.
    """
    svc.resend_api_key = "re_test_key"
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return _FakeResponse(200, '{"id":"abc"}')

    monkeypatch.setattr(httpx, "post", fake_post)

    ok = svc._send("dest@example.com", "Hi", "<p>Hello</p>")

    assert ok is True
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["headers"]["Authorization"] == "Bearer re_test_key"
    assert captured["json"]["to"] == ["dest@example.com"]
    assert captured["json"]["subject"] == "Hi"
    assert captured["json"]["html"] == "<p>Hello</p>"
    assert captured["json"]["from"] == "The Bend Community <support@bend.community>"


def test_resend_failure_returns_false_and_logs_body(svc, monkeypatch, caplog):
    """A provider error (e.g. the real 401 'Maximum credits exceeded') must
    return False AND log the response body — never fail silently."""
    svc.resend_api_key = "re_test_key"

    def fake_post(url, headers=None, json=None, timeout=None):
        return _FakeResponse(401, '{"message":"Maximum credits exceeded"}')

    monkeypatch.setattr(httpx, "post", fake_post)

    with caplog.at_level(logging.ERROR):
        ok = svc._send("dest@example.com", "Hi", "<p>Hello</p>")

    assert ok is False
    assert "Maximum credits exceeded" in caplog.text
    assert "dest@example.com" in caplog.text


def test_prefers_resend_over_sendgrid(svc, monkeypatch):
    """When both keys are set, Resend wins and SendGrid is not touched."""
    svc.resend_api_key = "re_test_key"
    svc.sendgrid_api_key = "SG.should_not_be_used"
    called = {"resend": False}

    def fake_post(url, headers=None, json=None, timeout=None):
        called["resend"] = True
        return _FakeResponse(200)

    monkeypatch.setattr(httpx, "post", fake_post)

    def boom(*a, **k):  # SendGrid path must never run
        raise AssertionError("SendGrid should not be used when Resend key is set")

    monkeypatch.setattr(svc, "_send_sendgrid", boom)

    assert svc._send("d@example.com", "s", "b") is True
    assert called["resend"] is True


def test_no_provider_returns_false(svc, caplog):
    """With no provider configured, _send logs a dev line and returns False."""
    with caplog.at_level(logging.INFO):
        ok = svc._send("dest@example.com", "Hi", "<p>Hello</p>")
    assert ok is False
    assert "DEV EMAIL" in caplog.text
