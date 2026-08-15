from datetime import datetime

import pytest

from app.services import connector_service
from app.services.connector_service import (
    ConnectorService,
    _dcr_page_url,
    _parse_dcr_event_page,
)


DCR_URL = (
    "https://www.dcr.virginia.gov/state-parks/events"
    "?park=westmoreland&start=07/21/2026&end=12/31/2026"
)


def _event_card(
    title: str,
    date_text: str,
    href: str,
    *,
    location: str = "Westmoreland State Park Visitor Center",
    description: str = "A ranger-led program for park visitors.",
    cancelled: bool = False,
) -> str:
    cancellation = "<p>This event has been canceled.</p>" if cancelled else ""
    return f"""
        <article class="event-card">
          {cancellation}
          <h3>{title}</h3>
          <p class="date">{date_text}</p>
          <p class="location">{location}</p>
          <p class="description">{description}</p>
          <a href="{href}">View Details</a>
        </article>
    """


def _results_page(count: int, *cards: str) -> str:
    return f"""
        <html><body>
          <h2>
            Between 07/21/2026 and 12/31/2026
            <span>({count}) Events Found For All Event Types</span>
          </h2>
          {''.join(cards)}
        </body></html>
    """


def test_dcr_parser_ignores_results_heading_and_parses_event_fields():
    html = _results_page(
        1,
        _event_card(
            "Campfire Kickoff",
            "August 21, 2026. 7:00 p.m. - 8:00 p.m.",
            "/state-parks/event-detail?event=campfire-kickoff",
        ),
    )

    events, reported_count = _parse_dcr_event_page(html, DCR_URL)

    assert reported_count == 1
    assert len(events) == 1
    assert events[0] == {
        "title": "Campfire Kickoff",
        "description": "A ranger-led program for park visitors.",
        "start_date": datetime(2026, 8, 21, 19, 0),
        "end_date": datetime(2026, 8, 21, 20, 0),
        "location": "Westmoreland State Park Visitor Center",
        "source_url": (
            "https://www.dcr.virginia.gov/state-parks/"
            "event-detail?event=campfire-kickoff"
        ),
        "status": "active",
    }


def test_dcr_parser_marks_cancelled_events_and_deduplicates_detail_links():
    card = _event_card(
        "Fossil Find",
        "September 5, 2026. 10:00 a.m. - 11:30 a.m.",
        "/state-parks/event-detail?event=fossil-find",
        cancelled=True,
    )
    events, _ = _parse_dcr_event_page(_results_page(1, card, card), DCR_URL)

    assert len(events) == 1
    assert events[0]["status"] == "cancelled"
    assert events[0]["description"].startswith("This event has been canceled.")


def test_dcr_parser_handles_split_time_and_park_location_fields():
    html = _results_page(
        1,
        """
          <article class="event-card">
            <h3>Campfire Kickoff</h3>
            <p class="date">
              <span>July 24, 2026.</span><span>7:00</span><span>p.m.</span>
              <span>-</span><span>8:00</span><span>p.m.</span>
            </p>
            <p>Westmoreland State Park</p>
            <p>Campground A</p>
            <p>Start your weekend off right with s'mores and more!</p>
            <a href="/state-parks/event?id=campfire-kickoff">View Details</a>
          </article>
        """,
    )

    events, _ = _parse_dcr_event_page(html, DCR_URL)

    assert events[0]["start_date"] == datetime(2026, 7, 24, 19, 0)
    assert events[0]["end_date"] == datetime(2026, 7, 24, 20, 0)
    assert events[0]["location"] == "Westmoreland State Park, Campground A"
    assert events[0]["description"] == (
        "Start your weekend off right with s'mores and more!"
    )


def test_dcr_parser_skips_cards_without_a_real_date_or_detail_link():
    html = _results_page(
        2,
        """
          <article>
            <h3>Navigation Heading</h3>
            <a href="/state-parks/event-detail?event=not-an-event">View Details</a>
          </article>
        """,
        """
          <article>
            <h3>Unlinked Event</h3>
            <p>October 2, 2026. 1:00 p.m. - 2:00 p.m.</p>
          </article>
        """,
    )

    events, reported_count = _parse_dcr_event_page(html, DCR_URL)

    assert reported_count == 2
    assert events == []


def test_dcr_page_url_preserves_filters_and_sets_page_number():
    page_url = _dcr_page_url(DCR_URL, 3)

    assert "park=westmoreland" in page_url
    assert "start=07%2F21%2F2026" in page_url
    assert "end=12%2F31%2F2026" in page_url
    assert "cp=3" in page_url


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self):
        return None


class _FakeClient:
    pages: dict[str, str] = {}

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return None

    async def get(self, url: str):
        return _FakeResponse(self.pages[url])


@pytest.mark.asyncio
async def test_dcr_parser_fetches_every_results_page(monkeypatch):
    first_page = _results_page(
        3,
        _event_card(
            "First Event",
            "October 1, 2026. 9:00 a.m. - 10:00 a.m.",
            "/state-parks/event-detail?event=first",
        ),
        _event_card(
            "Second Event",
            "October 2, 2026. 9:00 a.m. - 10:00 a.m.",
            "/state-parks/event-detail?event=second",
        ),
    )
    second_url = _dcr_page_url(DCR_URL, 2)
    _FakeClient.pages = {
        DCR_URL: first_page,
        second_url: _results_page(
            3,
            _event_card(
                "Third Event",
                "October 3, 2026. 9:00 a.m. - 10:00 a.m.",
                "/state-parks/event-detail?event=third",
            ),
        ),
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(DCR_URL, {})

    assert [event["title"] for event in events] == [
        "First Event",
        "Second Event",
        "Third Event",
    ]


@pytest.mark.asyncio
async def test_generic_html_parser_does_not_turn_a_summary_into_an_event(monkeypatch):
    url = "https://example.com/events"
    _FakeClient.pages = {
        url: _results_page(63),
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert events == []
