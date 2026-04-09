"""Seed script to create initial data for The Bend Community App."""
import asyncio
import sys
from uuid import uuid4
from datetime import datetime

from app.database import async_session
from app.models.user import User
from app.models.enums import UserRole
from app.models.event import Event, EventConnector
from app.models.volunteer import Volunteer
from app.models.talent import Talent
from app.models.sponsor import Sponsor
from app.models.ad_pricing import AdPricing


async def create_community_admin(
    email: str = "admin@thebend.app",
    password: str = "admin123456",
    name: str = "Community Admin",
):
    """Create the initial community admin user."""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(User).where(User.email == email)
        )
        existing = result.scalar_one_or_none()
        if existing:
            print(f"Admin user already exists: {email}")
            return

        admin = User(
            id=uuid4(),
            email=email,
            password_hash=pwd_context.hash(password),
            name=name,
            role=UserRole.COMMUNITY_ADMIN,
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        print(f"Community admin created: {email} / {password}")


async def seed_connector():
    """Seed the Local Scoop Magazine RSS connector."""
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(EventConnector).where(EventConnector.name == "Local Scoop Magazine")
        )
        if result.scalar_one_or_none():
            print("Connector already seeded")
            return

        connector = EventConnector(
            id=uuid4(),
            name="Local Scoop Magazine",
            type="rss",
            url="https://www.localscoopmagazine.com/api/rss/content.rss",
            category="community",
            is_active=True,
        )
        session.add(connector)
        await session.commit()
        print("Seeded: Local Scoop Magazine RSS connector")


async def seed_events():
    """Seed sample community events."""
    async with async_session() as session:
        from sqlalchemy import select, func
        count = await session.execute(select(func.count()).select_from(Event).where(Event.source == "manual"))
        if count.scalar_one() > 0:
            print("Events already seeded")
            return

        events = [
            Event(id=uuid4(), title="Montross Farmers Market", description="Fresh produce, baked goods, and local crafts every Saturday morning on the courthouse square.", start_date=datetime(2026, 4, 11, 8, 0), end_date=datetime(2026, 4, 11, 12, 0), location="Courthouse Square, Montross", category="market", source="manual", is_featured=True, status="active"),
            Event(id=uuid4(), title="Westmoreland Heritage Festival", description="Celebrate the rich history of Westmoreland County with live music, historical reenactments, and local food vendors.", start_date=datetime(2026, 4, 18, 10, 0), end_date=datetime(2026, 4, 18, 18, 0), location="Montross Town Green", category="historic", source="manual", is_featured=True, status="active"),
            Event(id=uuid4(), title="Live Jazz at the Inn", description="Enjoy an evening of smooth jazz with the Northern Neck Jazz Quartet. Light refreshments served.", start_date=datetime(2026, 4, 12, 19, 0), end_date=datetime(2026, 4, 12, 22, 0), location="Inn at Montross", category="music", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), title="Community Art Walk", description="Local artists open their studios for a self-guided walking tour through downtown Montross.", start_date=datetime(2026, 4, 19, 14, 0), end_date=datetime(2026, 4, 19, 17, 0), location="Downtown Montross", category="art", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), title="Spring BBQ Cook-Off", description="Amateur and pro pitmasters compete for the golden rib trophy. Tasting tickets available at the gate.", start_date=datetime(2026, 4, 25, 11, 0), end_date=datetime(2026, 4, 25, 16, 0), location="Montross Town Park", category="food", source="manual", is_featured=True, status="active"),
            Event(id=uuid4(), title="Outdoor Yoga in the Park", description="Start your weekend with a free community yoga session. All levels welcome. Bring your own mat.", start_date=datetime(2026, 4, 12, 8, 0), end_date=datetime(2026, 4, 12, 9, 30), location="Montross Town Park", category="outdoor", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), title="Stratford Hall Plantation Tour", description="Guided tours of the birthplace of Robert E. Lee. Special spring garden exhibit included.", start_date=datetime(2026, 4, 20, 10, 0), end_date=datetime(2026, 4, 20, 15, 0), location="Stratford Hall", category="historic", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), title="Youth STEM Workshop", description="Hands-on science and robotics workshop for kids ages 8-14. Limited spots — register early.", start_date=datetime(2026, 4, 15, 9, 0), end_date=datetime(2026, 4, 15, 12, 0), location="Rappahannock Community College", category="education", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), title="Northern Neck Wine Trail Weekend", description="Visit five local wineries with a single passport ticket. Live music at each stop.", start_date=datetime(2026, 4, 26, 11, 0), end_date=datetime(2026, 4, 27, 17, 0), location="Northern Neck Wine Trail", category="food", source="manual", is_featured=True, status="active"),
            Event(id=uuid4(), title="Acoustic Night at Callao Brewing", description="Local singer-songwriters perform in an intimate taproom setting. No cover charge.", start_date=datetime(2026, 4, 17, 18, 0), end_date=datetime(2026, 4, 17, 21, 0), location="Callao Brewing Company", category="music", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), title="Montross Library Book Sale", description="Annual spring book sale — thousands of gently used books, DVDs, and audiobooks at bargain prices.", start_date=datetime(2026, 4, 13, 9, 0), end_date=datetime(2026, 4, 13, 15, 0), location="Central Rappahannock Regional Library", category="community", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), title="Menokin Foundation Ruins Tour", description="Explore the 18th-century ruins of Menokin and learn about the innovative glass preservation project.", start_date=datetime(2026, 4, 22, 10, 0), end_date=datetime(2026, 4, 22, 14, 0), location="Menokin Foundation", category="historic", source="manual", is_featured=False, status="active"),
        ]
        session.add_all(events)
        await session.commit()
        print(f"Seeded: {len(events)} events")


async def seed_volunteers():
    """Seed sample volunteers."""
    async with async_session() as session:
        from sqlalchemy import select, func
        count = await session.execute(select(func.count()).select_from(Volunteer))
        if count.scalar_one() > 0:
            print("Volunteers already seeded")
            return

        volunteers = [
            Volunteer(id=uuid4(), name="James Carter", phone="804-555-0112", skills="Carpentry, painting, general repairs", available_time="Weekends 8am-4pm"),
            Volunteer(id=uuid4(), name="Linda Hawkins", phone="804-555-0234", skills="Cooking, baking, event catering", available_time="Weekday evenings after 5pm"),
            Volunteer(id=uuid4(), name="Marcus Johnson", phone="804-555-0345", skills="Customer service, inventory, stocking", available_time="Flexible, Mon-Fri"),
            Volunteer(id=uuid4(), name="Patricia Bell", phone="804-555-0456", skills="Gardening, landscaping, planting", available_time="Saturday mornings"),
            Volunteer(id=uuid4(), name="Robert Tanner", phone="804-555-0567", skills="Electrical work, plumbing basics", available_time="Weekends, call first"),
            Volunteer(id=uuid4(), name="Angela Davis", phone="804-555-0678", skills="Cleaning, organizing, decluttering", available_time="Tuesdays and Thursdays"),
            Volunteer(id=uuid4(), name="William Monroe", phone="804-555-0789", skills="Delivery driving, heavy lifting, moving", available_time="Anytime with 24hr notice"),
            Volunteer(id=uuid4(), name="Sarah Mitchell", phone="804-555-0890", skills="Teaching, tutoring, childcare", available_time="Weekday afternoons"),
        ]
        session.add_all(volunteers)
        await session.commit()
        print(f"Seeded: {len(volunteers)} volunteers")


async def seed_talent():
    """Seed sample talent profiles."""
    async with async_session() as session:
        from sqlalchemy import select, func
        count = await session.execute(select(func.count()).select_from(Talent))
        if count.scalar_one() > 0:
            print("Talent already seeded")
            return

        talent = [
            Talent(id=uuid4(), name="Elijah Rivers", phone="804-555-1001", category="musician", skills="Guitar, vocals, blues, folk, live performance", available_time="Fri-Sun evenings", rate=75.00, rate_unit="gig"),
            Talent(id=uuid4(), name="Maya Chen", phone="804-555-1002", category="artist", skills="Portrait painting, murals, watercolor, acrylics", available_time="By appointment", rate=45.00, rate_unit="hr"),
            Talent(id=uuid4(), name="Derek Washington", phone="804-555-1003", category="freelancer", skills="Photography, videography, drone footage, editing", available_time="Weekends preferred", rate=150.00, rate_unit="gig"),
            Talent(id=uuid4(), name="Nina Beaumont", phone="804-555-1004", category="musician", skills="Piano, jazz standards, event accompaniment, singing", available_time="Evenings and weekends", rate=200.00, rate_unit="gig"),
            Talent(id=uuid4(), name="Thomas Hargrove", phone="804-555-1005", category="freelancer", skills="Web design, social media management, graphic design", available_time="Remote, flexible hours", rate=35.00, rate_unit="hr"),
            Talent(id=uuid4(), name="Rosa Martinez", phone="804-555-1006", category="artist", skills="Pottery, ceramics, clay sculpture, workshops", available_time="Sat-Sun 10am-4pm", rate=60.00, rate_unit="hr"),
            Talent(id=uuid4(), name="Calvin Brooks", phone="804-555-1007", category="musician", skills="Fiddle, mandolin, bluegrass, country, barn dances", available_time="Fri-Sat nights", rate=100.00, rate_unit="gig"),
            Talent(id=uuid4(), name="Diane Forrester", phone="804-555-1008", category="freelancer", skills="Event planning, coordination, vendor management", available_time="Flexible with advance booking", rate=250.00, rate_unit="day"),
            Talent(id=uuid4(), name="Antoine Lewis", phone="804-555-1009", category="artist", skills="Woodworking, custom furniture, wood carving, signs", available_time="Weekdays", rate=50.00, rate_unit="hr"),
            Talent(id=uuid4(), name="Hannah Whitfield", phone="804-555-1010", category="musician", skills="Cello, classical, string quartet, weddings", available_time="By appointment", rate=175.00, rate_unit="gig"),
        ]
        session.add_all(talent)
        await session.commit()
        print(f"Seeded: {len(talent)} talent profiles")


async def sync_connector():
    """Sync the RSS connector to pull in events."""
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(EventConnector).where(EventConnector.name == "Local Scoop Magazine")
        )
        connector = result.scalar_one_or_none()
        if not connector:
            print("No connector to sync")
            return

        from app.services.connector_service import ConnectorService
        svc = ConnectorService(session)
        try:
            result = await svc.sync_connector(connector.id)
            await session.commit()
            print(f"Synced connector: {result}")
        except Exception as e:
            print(f"Connector sync failed (non-fatal): {e}")


async def seed_sponsors():
    """Seed premium sponsors."""
    async with async_session() as session:
        from sqlalchemy import select, func
        from app.models.sponsor import Sponsor
        count = await session.execute(select(func.count()).select_from(Sponsor))
        if count.scalar_one() > 0:
            print("Sponsors already seeded")
            return

        sponsors = [
            # ProLine Group — all placements
            Sponsor(id=uuid4(), name="ProLine Group", description="AI-Native Business Infrastructure. Top-tier management consulting rigor meets AI-native execution.", logo_url="/images/proline-logo.jpeg", website_url="https://www.proline-online.com", placement="homepage", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@proline-online.com", contact_name="ProLine Group"),
            Sponsor(id=uuid4(), name="ProLine Group", description="AI-Native Business Infrastructure. Top-tier management consulting rigor meets AI-native execution.", logo_url="/images/proline-logo.jpeg", website_url="https://www.proline-online.com", placement="browse", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@proline-online.com", contact_name="ProLine Group"),
            Sponsor(id=uuid4(), name="ProLine Group", description="AI-Native Business Infrastructure. Top-tier management consulting rigor meets AI-native execution.", logo_url="/images/proline-logo.jpeg", website_url="https://www.proline-online.com", placement="events", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@proline-online.com", contact_name="ProLine Group"),
            Sponsor(id=uuid4(), name="ProLine Group", description="AI-Native Business Infrastructure. Top-tier management consulting rigor meets AI-native execution.", logo_url="/images/proline-logo.jpeg", website_url="https://www.proline-online.com", placement="footer", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@proline-online.com", contact_name="ProLine Group"),
            # Inn at Montross — all placements
            Sponsor(id=uuid4(), name="Inn at Montross", description="Historic Bed & Breakfast offering five thoughtfully appointed rooms in a 19th-century building, featuring a pub and dining that celebrates local flavor.", logo_url="https://lirp.cdn-website.com/45b680d6/dms3rep/multi/opt/Inn-at-Montross-73dfbf66-5fb56aef-1920w.png", website_url="https://www.montrossinn.com", placement="homepage", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@montrossinn.com", contact_name="Inn at Montross"),
            Sponsor(id=uuid4(), name="Inn at Montross", description="Historic Bed & Breakfast offering five thoughtfully appointed rooms in a 19th-century building, featuring a pub and dining that celebrates local flavor.", logo_url="https://lirp.cdn-website.com/45b680d6/dms3rep/multi/opt/Inn-at-Montross-73dfbf66-5fb56aef-1920w.png", website_url="https://www.montrossinn.com", placement="browse", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@montrossinn.com", contact_name="Inn at Montross"),
            Sponsor(id=uuid4(), name="Inn at Montross", description="Historic Bed & Breakfast offering five thoughtfully appointed rooms in a 19th-century building, featuring a pub and dining that celebrates local flavor.", logo_url="https://lirp.cdn-website.com/45b680d6/dms3rep/multi/opt/Inn-at-Montross-73dfbf66-5fb56aef-1920w.png", website_url="https://www.montrossinn.com", placement="events", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@montrossinn.com", contact_name="Inn at Montross"),
            Sponsor(id=uuid4(), name="Inn at Montross", description="Historic Bed & Breakfast offering five thoughtfully appointed rooms in a 19th-century building, featuring a pub and dining that celebrates local flavor.", logo_url="https://lirp.cdn-website.com/45b680d6/dms3rep/multi/opt/Inn-at-Montross-73dfbf66-5fb56aef-1920w.png", website_url="https://www.montrossinn.com", placement="footer", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@montrossinn.com", contact_name="Inn at Montross"),
            # Provoke — all placements
            Sponsor(id=uuid4(), name="Provoke", description="One workspace. Every workflow. AI-powered workspace unifying chat, email, calendar, projects, and media generation.", logo_url="/images/provoke-logo.png", website_url="https://provoke.space", placement="homepage", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@provoke.space", contact_name="Provoke"),
            Sponsor(id=uuid4(), name="Provoke", description="One workspace. Every workflow. AI-powered workspace unifying chat, email, calendar, projects, and media generation.", logo_url="/images/provoke-logo.png", website_url="https://provoke.space", placement="browse", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@provoke.space", contact_name="Provoke"),
            Sponsor(id=uuid4(), name="Provoke", description="One workspace. Every workflow. AI-powered workspace unifying chat, email, calendar, projects, and media generation.", logo_url="/images/provoke-logo.png", website_url="https://provoke.space", placement="events", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@provoke.space", contact_name="Provoke"),
            Sponsor(id=uuid4(), name="Provoke", description="One workspace. Every workflow. AI-powered workspace unifying chat, email, calendar, projects, and media generation.", logo_url="/images/provoke-logo.png", website_url="https://provoke.space", placement="footer", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@provoke.space", contact_name="Provoke"),
            # Westmoreland County Museum — all placements
            Sponsor(id=uuid4(), name="Westmoreland County Museum", description="Preserving and celebrating the rich history of Westmoreland County — birthplace of American presidents.", logo_url="/images/westmoreland-museum-logo.jpeg", website_url="https://www.westmorelandcountymuseum.org/", placement="homepage", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@westmorelandcountymuseum.org", contact_name="Westmoreland County Museum"),
            Sponsor(id=uuid4(), name="Westmoreland County Museum", description="Preserving and celebrating the rich history of Westmoreland County — birthplace of American presidents.", logo_url="/images/westmoreland-museum-logo.jpeg", website_url="https://www.westmorelandcountymuseum.org/", placement="browse", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@westmorelandcountymuseum.org", contact_name="Westmoreland County Museum"),
            Sponsor(id=uuid4(), name="Westmoreland County Museum", description="Preserving and celebrating the rich history of Westmoreland County — birthplace of American presidents.", logo_url="/images/westmoreland-museum-logo.jpeg", website_url="https://www.westmorelandcountymuseum.org/", placement="events", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@westmorelandcountymuseum.org", contact_name="Westmoreland County Museum"),
            Sponsor(id=uuid4(), name="Westmoreland County Museum", description="Preserving and celebrating the rich history of Westmoreland County — birthplace of American presidents.", logo_url="/images/westmoreland-museum-logo.jpeg", website_url="https://www.westmorelandcountymuseum.org/", placement="footer", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@westmorelandcountymuseum.org", contact_name="Westmoreland County Museum"),
        ]
        session.add_all(sponsors)
        await session.commit()
        print(f"Seeded: {len(sponsors)} sponsors")


async def seed_ad_pricing():
    """Seed ad pricing plans."""
    async with async_session() as session:
        from sqlalchemy import select, func
        from app.models.ad_pricing import AdPricing
        count = await session.execute(select(func.count()).select_from(AdPricing))
        if count.scalar_one() > 0:
            print("Ad pricing already seeded")
            return

        plans = [
            AdPricing(id=uuid4(), name="Homepage Feature", description="Premium placement on the homepage between services and community board", placement="homepage", duration_days=30, price_cents=4999, is_active=True, sort_order=1),
            AdPricing(id=uuid4(), name="Homepage Feature (90 days)", description="Premium homepage placement — best value", placement="homepage", duration_days=90, price_cents=11999, is_active=True, sort_order=2),
            AdPricing(id=uuid4(), name="Browse Page", description="Shown to users actively browsing listings", placement="browse", duration_days=30, price_cents=2999, is_active=True, sort_order=3),
            AdPricing(id=uuid4(), name="Events Page", description="Reach the community event audience", placement="events", duration_days=30, price_cents=2999, is_active=True, sort_order=4),
            AdPricing(id=uuid4(), name="Footer Partners", description="Displayed on every page in the partner strip", placement="footer", duration_days=30, price_cents=1999, is_active=True, sort_order=5),
            AdPricing(id=uuid4(), name="Footer Partners (90 days)", description="Every-page visibility — best value", placement="footer", duration_days=90, price_cents=4999, is_active=True, sort_order=6),
        ]
        session.add_all(plans)
        await session.commit()
        print(f"Seeded: {len(plans)} ad pricing plans")


async def main():
    await create_community_admin()
    await seed_connector()
    await seed_events()
    await seed_volunteers()
    await seed_talent()
    await seed_sponsors()
    await seed_ad_pricing()
    await sync_connector()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        email = sys.argv[1]
        password = sys.argv[2] if len(sys.argv) > 2 else "admin123456"
        asyncio.run(create_community_admin(email, password))
    else:
        asyncio.run(main())
