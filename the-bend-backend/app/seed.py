"""Seed script to create initial data for The Bend Community App."""
import asyncio
import sys
from uuid import uuid4
from datetime import datetime

from app.database import async_session
from app.models.user import User
from app.models.tenant import Tenant
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.enums import UserRole, ShopStatus, ListingStatus, ListingType, ListingCategory, UrgencyLevel
from app.models.event import Event, EventConnector
from app.models.volunteer import Volunteer
from app.models.talent import Talent
from app.models.sponsor import Sponsor
from app.models.ad_pricing import AdPricing
from app.core.security import hash_password

# Module-level reference to the default tenant id
_default_tenant_id = None


async def ensure_default_tenant() -> "uuid.UUID":
    """Create the default 'westmoreland' tenant if it doesn't exist and return its id."""
    global _default_tenant_id
    from sqlalchemy import select
    async with async_session() as session:
        # Check if westmoreland already exists
        result = await session.execute(select(Tenant).where(Tenant.slug == "westmoreland"))
        tenant = result.scalar_one_or_none()
        if tenant:
            _default_tenant_id = tenant.id
            print(f"Default tenant already exists: westmoreland (id={tenant.id})")
            return tenant.id

        # Migrate existing 'montross' tenant to 'westmoreland' if it exists
        result = await session.execute(select(Tenant).where(Tenant.slug == "montross"))
        old_tenant = result.scalar_one_or_none()
        if old_tenant:
            old_tenant.slug = "westmoreland"
            old_tenant.subdomain = "westmoreland.bend.community"
            old_tenant.display_name = "The Bend \u2014 Westmoreland"
            await session.commit()
            _default_tenant_id = old_tenant.id
            print(f"Migrated tenant montross -> westmoreland (id={old_tenant.id})")
            return old_tenant.id

        tid = uuid4()
        tenant = Tenant(
            id=tid,
            slug="westmoreland",
            subdomain="westmoreland.bend.community",
            display_name="The Bend \u2014 Westmoreland",
            tagline="Find opportunity within your neighborhood",
            about_text="An unexpected bend in the road can cause businesses and community members to work and live inefficiently. The Bend exists to support the many \u201cbends\u201d in Westmoreland County roads that have flipped the script, and serve as community hubs and places of opportunity.",
            hero_image_url="/images/the-bend-hero.jpg",
            logo_url=None,
            primary_color="hsl(160,25%,24%)",
            footer_text="Preserving community, one connection at a time",
        )
        session.add(tenant)
        await session.commit()
        _default_tenant_id = tid
        print(f"Default tenant created: westmoreland (id={tid})")
        return tid


async def create_super_admin():
    """Create the super admin user (no tenant)."""
    from passlib.context import CryptContext
    from app.config import get_settings
    settings = get_settings()
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(User).where(User.email == settings.SUPER_ADMIN_EMAIL)
        )
        if result.scalar_one_or_none():
            print(f"Super admin already exists: {settings.SUPER_ADMIN_EMAIL}")
            return

        admin = User(
            id=uuid4(),
            email=settings.SUPER_ADMIN_EMAIL,
            password_hash=pwd_context.hash(settings.SUPER_ADMIN_PASSWORD),
            name="Super Admin",
            role=UserRole.SUPER_ADMIN,
            tenant_id=None,
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        print(f"Super admin created: {settings.SUPER_ADMIN_EMAIL}")


async def create_community_admin(
    email: str = "admin@thebend.app",
    password: str = "admin123456",
    name: str = "Community Admin",
):
    """Create the initial community admin user for the default tenant."""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    tenant_id = _default_tenant_id

    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(User).where(User.email == email)
        )
        existing = result.scalar_one_or_none()
        if existing:
            # Backfill tenant_id if missing
            if not existing.tenant_id and tenant_id:
                existing.tenant_id = tenant_id
                await session.commit()
            print(f"Admin user already exists: {email}")
            return

        admin = User(
            id=uuid4(),
            email=email,
            password_hash=pwd_context.hash(password),
            name=name,
            role=UserRole.COMMUNITY_ADMIN,
            tenant_id=tenant_id,
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

        tenant_id = _default_tenant_id
        events = [
            Event(id=uuid4(), tenant_id=tenant_id, title="Montross Farmers Market", description="Fresh produce, baked goods, and local crafts every Saturday morning on the courthouse square.", start_date=datetime(2026, 4, 11, 8, 0), end_date=datetime(2026, 4, 11, 12, 0), location="Courthouse Square, Montross", category="market", source="manual", is_featured=True, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Westmoreland Heritage Festival", description="Celebrate the rich history of Westmoreland County with live music, historical reenactments, and local food vendors.", start_date=datetime(2026, 4, 18, 10, 0), end_date=datetime(2026, 4, 18, 18, 0), location="Montross Town Green", category="historic", source="manual", is_featured=True, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Live Jazz at the Inn", description="Enjoy an evening of smooth jazz with the Northern Neck Jazz Quartet. Light refreshments served.", start_date=datetime(2026, 4, 12, 19, 0), end_date=datetime(2026, 4, 12, 22, 0), location="Inn at Montross", category="music", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Community Art Walk", description="Local artists open their studios for a self-guided walking tour through downtown Montross.", start_date=datetime(2026, 4, 19, 14, 0), end_date=datetime(2026, 4, 19, 17, 0), location="Downtown Montross", category="art", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Spring BBQ Cook-Off", description="Amateur and pro pitmasters compete for the golden rib trophy. Tasting tickets available at the gate.", start_date=datetime(2026, 4, 25, 11, 0), end_date=datetime(2026, 4, 25, 16, 0), location="Montross Town Park", category="food", source="manual", is_featured=True, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Outdoor Yoga in the Park", description="Start your weekend with a free community yoga session. All levels welcome. Bring your own mat.", start_date=datetime(2026, 4, 12, 8, 0), end_date=datetime(2026, 4, 12, 9, 30), location="Montross Town Park", category="outdoor", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Stratford Hall Plantation Tour", description="Guided tours of the birthplace of Robert E. Lee. Special spring garden exhibit included.", start_date=datetime(2026, 4, 20, 10, 0), end_date=datetime(2026, 4, 20, 15, 0), location="Stratford Hall", category="historic", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Youth STEM Workshop", description="Hands-on science and robotics workshop for kids ages 8-14. Limited spots — register early.", start_date=datetime(2026, 4, 15, 9, 0), end_date=datetime(2026, 4, 15, 12, 0), location="Rappahannock Community College", category="education", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Northern Neck Wine Trail Weekend", description="Visit five local wineries with a single passport ticket. Live music at each stop.", start_date=datetime(2026, 4, 26, 11, 0), end_date=datetime(2026, 4, 27, 17, 0), location="Northern Neck Wine Trail", category="food", source="manual", is_featured=True, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Acoustic Night at Callao Brewing", description="Local singer-songwriters perform in an intimate taproom setting. No cover charge.", start_date=datetime(2026, 4, 17, 18, 0), end_date=datetime(2026, 4, 17, 21, 0), location="Callao Brewing Company", category="music", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Montross Library Book Sale", description="Annual spring book sale — thousands of gently used books, DVDs, and audiobooks at bargain prices.", start_date=datetime(2026, 4, 13, 9, 0), end_date=datetime(2026, 4, 13, 15, 0), location="Central Rappahannock Regional Library", category="community", source="manual", is_featured=False, status="active"),
            Event(id=uuid4(), tenant_id=tenant_id, title="Menokin Foundation Ruins Tour", description="Explore the 18th-century ruins of Menokin and learn about the innovative glass preservation project.", start_date=datetime(2026, 4, 22, 10, 0), end_date=datetime(2026, 4, 22, 14, 0), location="Menokin Foundation", category="historic", source="manual", is_featured=False, status="active"),
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
            Volunteer(id=uuid4(), tenant_id=_default_tenant_id, name="James Carter", phone="804-555-0112", email="james.carter@example.com", skills="Carpentry, painting, general repairs", available_time="Weekends 8am-4pm"),
            Volunteer(id=uuid4(), tenant_id=_default_tenant_id, name="Linda Hawkins", phone="804-555-0234", email="linda.hawkins@example.com", skills="Cooking, baking, event catering", available_time="Weekday evenings after 5pm"),
            Volunteer(id=uuid4(), tenant_id=_default_tenant_id, name="Marcus Johnson", phone="804-555-0345", email="marcus.johnson@example.com", skills="Customer service, inventory, stocking", available_time="Flexible, Mon-Fri"),
            Volunteer(id=uuid4(), tenant_id=_default_tenant_id, name="Patricia Bell", phone="804-555-0456", email="patricia.bell@example.com", skills="Gardening, landscaping, planting", available_time="Saturday mornings"),
            Volunteer(id=uuid4(), tenant_id=_default_tenant_id, name="Robert Tanner", phone="804-555-0567", email="robert.tanner@example.com", skills="Electrical work, plumbing basics", available_time="Weekends, call first"),
            Volunteer(id=uuid4(), tenant_id=_default_tenant_id, name="Angela Davis", phone="804-555-0678", email="angela.davis@example.com", skills="Cleaning, organizing, decluttering", available_time="Tuesdays and Thursdays"),
            Volunteer(id=uuid4(), tenant_id=_default_tenant_id, name="William Monroe", phone="804-555-0789", email="william.monroe@example.com", skills="Delivery driving, heavy lifting, moving", available_time="Anytime with 24hr notice"),
            Volunteer(id=uuid4(), tenant_id=_default_tenant_id, name="Sarah Mitchell", phone="804-555-0890", email="sarah.mitchell@example.com", skills="Teaching, tutoring, childcare", available_time="Weekday afternoons"),
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
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Elijah Rivers", phone="804-555-1001", email="elijah.rivers@example.com", category="musician", skills="Guitar, vocals, blues, folk, live performance", available_time="Fri-Sun evenings", rate=75.00, rate_unit="gig"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Maya Chen", phone="804-555-1002", email="maya.chen@example.com", category="artist", skills="Portrait painting, murals, watercolor, acrylics", available_time="By appointment", rate=45.00, rate_unit="hr"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Derek Washington", phone="804-555-1003", email="derek.washington@example.com", category="freelancer", skills="Photography, videography, drone footage, editing", available_time="Weekends preferred", rate=150.00, rate_unit="gig"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Nina Beaumont", phone="804-555-1004", email="nina.beaumont@example.com", category="musician", skills="Piano, jazz standards, event accompaniment, singing", available_time="Evenings and weekends", rate=200.00, rate_unit="gig"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Thomas Hargrove", phone="804-555-1005", email="thomas.hargrove@example.com", category="freelancer", skills="Web design, social media management, graphic design", available_time="Remote, flexible hours", rate=35.00, rate_unit="hr"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Rosa Martinez", phone="804-555-1006", email="rosa.martinez@example.com", category="artist", skills="Pottery, ceramics, clay sculpture, workshops", available_time="Sat-Sun 10am-4pm", rate=60.00, rate_unit="hr"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Calvin Brooks", phone="804-555-1007", email="calvin.brooks@example.com", category="musician", skills="Fiddle, mandolin, bluegrass, country, barn dances", available_time="Fri-Sat nights", rate=100.00, rate_unit="gig"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Diane Forrester", phone="804-555-1008", email="diane.forrester@example.com", category="freelancer", skills="Event planning, coordination, vendor management", available_time="Flexible with advance booking", rate=250.00, rate_unit="day"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Antoine Lewis", phone="804-555-1009", email="antoine.lewis@example.com", category="artist", skills="Woodworking, custom furniture, wood carving, signs", available_time="Weekdays", rate=50.00, rate_unit="hr"),
            Talent(id=uuid4(), tenant_id=_default_tenant_id, name="Hannah Whitfield", phone="804-555-1010", email="hannah.whitfield@example.com", category="musician", skills="Cello, classical, string quartet, weddings", available_time="By appointment", rate=175.00, rate_unit="gig"),
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
        from sqlalchemy import select, func, delete
        # Always refresh seeded sponsors to ensure logos/data stay current
        # Only deletes seeded sponsors, preserves user-purchased ones from Stripe
        await session.execute(delete(Sponsor).where(Sponsor.contact_name.in_([
            'ProLine Group', 'Inn at Montross', 'Provoke', 'Westmoreland County Museum'
        ])))
        await session.flush()

        sponsors = [
            # ProLine Group — all placements
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="ProLine Group", description="AI-Native Business Infrastructure. Top-tier management consulting rigor meets AI-native execution.", logo_url="/images/proline-logo.png", website_url="https://www.proline-online.com", placement="homepage", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@proline-online.com", contact_name="ProLine Group"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="ProLine Group", description="AI-Native Business Infrastructure. Top-tier management consulting rigor meets AI-native execution.", logo_url="/images/proline-logo.png", website_url="https://www.proline-online.com", placement="browse", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@proline-online.com", contact_name="ProLine Group"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="ProLine Group", description="AI-Native Business Infrastructure. Top-tier management consulting rigor meets AI-native execution.", logo_url="/images/proline-logo.png", website_url="https://www.proline-online.com", placement="events", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@proline-online.com", contact_name="ProLine Group"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="ProLine Group", description="AI-Native Business Infrastructure. Top-tier management consulting rigor meets AI-native execution.", logo_url="/images/proline-logo.png", website_url="https://www.proline-online.com", placement="footer", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@proline-online.com", contact_name="ProLine Group"),
            # Inn at Montross — all placements
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Inn at Montross", description="Historic Bed & Breakfast offering five thoughtfully appointed rooms in a 19th-century building, featuring a pub and dining that celebrates local flavor.", logo_url="https://lirp.cdn-website.com/45b680d6/dms3rep/multi/opt/Inn-at-Montross-73dfbf66-5fb56aef-1920w.png", website_url="https://www.montrossinn.com", placement="homepage", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@montrossinn.com", contact_name="Inn at Montross"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Inn at Montross", description="Historic Bed & Breakfast offering five thoughtfully appointed rooms in a 19th-century building, featuring a pub and dining that celebrates local flavor.", logo_url="https://lirp.cdn-website.com/45b680d6/dms3rep/multi/opt/Inn-at-Montross-73dfbf66-5fb56aef-1920w.png", website_url="https://www.montrossinn.com", placement="browse", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@montrossinn.com", contact_name="Inn at Montross"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Inn at Montross", description="Historic Bed & Breakfast offering five thoughtfully appointed rooms in a 19th-century building, featuring a pub and dining that celebrates local flavor.", logo_url="https://lirp.cdn-website.com/45b680d6/dms3rep/multi/opt/Inn-at-Montross-73dfbf66-5fb56aef-1920w.png", website_url="https://www.montrossinn.com", placement="events", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@montrossinn.com", contact_name="Inn at Montross"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Inn at Montross", description="Historic Bed & Breakfast offering five thoughtfully appointed rooms in a 19th-century building, featuring a pub and dining that celebrates local flavor.", logo_url="https://lirp.cdn-website.com/45b680d6/dms3rep/multi/opt/Inn-at-Montross-73dfbf66-5fb56aef-1920w.png", website_url="https://www.montrossinn.com", placement="footer", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@montrossinn.com", contact_name="Inn at Montross"),
            # Provoke — all placements
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Provoke", description="One workspace. Every workflow. AI-powered workspace unifying chat, email, calendar, projects, and media generation.", logo_url="/images/provoke-logo.png", website_url="https://provoke.space", placement="homepage", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@provoke.space", contact_name="Provoke"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Provoke", description="One workspace. Every workflow. AI-powered workspace unifying chat, email, calendar, projects, and media generation.", logo_url="/images/provoke-logo.png", website_url="https://provoke.space", placement="browse", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@provoke.space", contact_name="Provoke"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Provoke", description="One workspace. Every workflow. AI-powered workspace unifying chat, email, calendar, projects, and media generation.", logo_url="/images/provoke-logo.png", website_url="https://provoke.space", placement="events", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@provoke.space", contact_name="Provoke"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Provoke", description="One workspace. Every workflow. AI-powered workspace unifying chat, email, calendar, projects, and media generation.", logo_url="/images/provoke-logo.png", website_url="https://provoke.space", placement="footer", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@provoke.space", contact_name="Provoke"),
            # Westmoreland County Museum — all placements
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Westmoreland County Museum", description="Preserving and celebrating the rich history of Westmoreland County — birthplace of American presidents.", logo_url="/images/westmoreland-museum-logo.png", website_url="https://www.westmorelandcountymuseum.org/", placement="homepage", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@westmorelandcountymuseum.org", contact_name="Westmoreland County Museum"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Westmoreland County Museum", description="Preserving and celebrating the rich history of Westmoreland County — birthplace of American presidents.", logo_url="/images/westmoreland-museum-logo.png", website_url="https://www.westmorelandcountymuseum.org/", placement="browse", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@westmorelandcountymuseum.org", contact_name="Westmoreland County Museum"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Westmoreland County Museum", description="Preserving and celebrating the rich history of Westmoreland County — birthplace of American presidents.", logo_url="/images/westmoreland-museum-logo.png", website_url="https://www.westmorelandcountymuseum.org/", placement="events", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@westmorelandcountymuseum.org", contact_name="Westmoreland County Museum"),
            Sponsor(id=uuid4(), tenant_id=_default_tenant_id, name="Westmoreland County Museum", description="Preserving and celebrating the rich history of Westmoreland County — birthplace of American presidents.", logo_url="/images/westmoreland-museum-logo.png", website_url="https://www.westmorelandcountymuseum.org/", placement="footer", is_active=True, paid=True, approved=True, sort_order=0, contact_email="info@westmorelandcountymuseum.org", contact_name="Westmoreland County Museum"),
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
            AdPricing(id=uuid4(), tenant_id=_default_tenant_id, name="Homepage Feature", description="Premium placement on the homepage between services and community board", placement="homepage", duration_days=90, price_cents=34999, is_active=True, sort_order=1),
            AdPricing(id=uuid4(), tenant_id=_default_tenant_id, name="Browse Page", description="Shown to users actively browsing listings", placement="browse", duration_days=90, price_cents=24999, is_active=True, sort_order=2),
            AdPricing(id=uuid4(), tenant_id=_default_tenant_id, name="Events Page", description="Reach the community event audience", placement="events", duration_days=90, price_cents=24999, is_active=True, sort_order=3),
            AdPricing(id=uuid4(), tenant_id=_default_tenant_id, name="Footer Partners", description="Displayed on every page in the partner strip", placement="footer", duration_days=90, price_cents=14999, is_active=True, sort_order=4),
        ]
        session.add_all(plans)
        await session.commit()
        print(f"Seeded: {len(plans)} ad pricing plans")


async def seed_stories():
    """Seed sample success stories."""
    async with async_session() as session:
        from sqlalchemy import select, func
        from app.models.success_story import SuccessStory
        from app.models.listing import Listing
        from app.models.enums import ListingStatus

        count = await session.execute(select(func.count()).select_from(SuccessStory))
        if count.scalar_one() > 0:
            print("Stories already seeded")
            return

        # Get fulfilled listings
        result = await session.execute(
            select(Listing).where(Listing.status == ListingStatus.FULFILLED).limit(5)
        )
        fulfilled = result.scalars().all()

        quotes = [
            "This platform saved us during our busiest weekend. Found exactly what we needed in hours, not days.",
            "The Bend connected us with a neighbor who had surplus supplies. We saved money and reduced waste — everyone wins.",
            "I was skeptical at first, but the community response was incredible. Three people offered help within an hour.",
            "Sharing equipment with nearby businesses just makes sense. Why did we not do this sooner?",
            "The Bend made our community feel smaller in the best way. We know our neighbors now.",
        ]

        stories = []
        for i, listing in enumerate(fulfilled):
            stories.append(SuccessStory(
                id=uuid4(),
                listing_id=listing.id,
                author_name="Community Member",
                quote=quotes[i % len(quotes)],
                is_featured=i < 3,
            ))

        if stories:
            session.add_all(stories)
            await session.commit()
            print(f"Seeded: {len(stories)} success stories")
        else:
            print("No fulfilled listings to create stories for")


async def _create_tenant_with_data(
    slug: str, subdomain: str, display_name: str, tagline: str, about_text: str,
    primary_color: str, footer_text: str,
    admin_email: str, admin_password: str, admin_name: str,
    shops_data: list, listings_data: list, events_data: list,
    volunteers_data: list, talent_data: list,
):
    """Create a tenant with admin, shops, listings, events, volunteers, and talent."""
    from sqlalchemy import select, func

    async with async_session() as session:
        # Check if tenant already exists
        result = await session.execute(select(Tenant).where(Tenant.slug == slug))
        if result.scalar_one_or_none():
            print(f"Tenant '{slug}' already seeded")
            return

        # Create tenant
        tid = uuid4()
        tenant = Tenant(
            id=tid, slug=slug, subdomain=subdomain, display_name=display_name,
            tagline=tagline, about_text=about_text, primary_color=primary_color,
            footer_text=footer_text,
        )
        session.add(tenant)
        await session.flush()

        # Create community admin
        admin = User(
            id=uuid4(), email=admin_email, password_hash=hash_password(admin_password),
            name=admin_name, role=UserRole.COMMUNITY_ADMIN, tenant_id=tid, is_active=True,
        )
        session.add(admin)
        await session.flush()

        # Create shops with owners
        shop_ids = []
        for shop_name, btype, addr, owner_name, email, phone in shops_data:
            user = User(
                id=uuid4(), email=email, password_hash=hash_password("shop12345678"),
                name=owner_name, role=UserRole.SHOP_ADMIN, tenant_id=tid, is_active=True,
            )
            session.add(user)
            await session.flush()
            shop = Shop(
                id=uuid4(), name=shop_name, business_type=btype, address=addr,
                contact_phone=phone, status=ShopStatus.ACTIVE, admin_user_id=user.id,
                tenant_id=tid, guidelines_accepted=True, guidelines_accepted_at=datetime.utcnow(),
            )
            session.add(shop)
            await session.flush()
            user.shop_id = shop.id
            await session.flush()
            shop_ids.append(shop.id)

        # Create listings
        for shop_idx, ltype, cat, title, desc, price, is_free, urgency in listings_data:
            session.add(Listing(
                id=uuid4(), shop_id=shop_ids[shop_idx], tenant_id=tid,
                type=ltype, category=cat, title=title, description=desc,
                price=price, is_free=is_free, urgency=urgency, status=ListingStatus.ACTIVE,
            ))

        # Create events
        for evt in events_data:
            evt["tenant_id"] = tid
            session.add(Event(**evt))

        # Create volunteers
        for v in volunteers_data:
            v["tenant_id"] = tid
            session.add(Volunteer(**v))

        # Create talent
        for t in talent_data:
            t["tenant_id"] = tid
            session.add(Talent(**t))

        await session.commit()
        print(f"Seeded tenant '{slug}': {len(shops_data)} shops, {len(listings_data)} listings, {len(events_data)} events, {len(volunteers_data)} volunteers, {len(talent_data)} talent")


async def seed_king_george():
    await _create_tenant_with_data(
        slug="king-george", subdomain="king-george.bend.community",
        display_name="The Bend \u2014 King George",
        tagline="Connecting King George County businesses",
        about_text="The Bend \u2014 King George brings the same community marketplace to King George County, helping local businesses share resources and thrive together.",
        primary_color="hsl(220,30%,28%)", footer_text="Building community, one connection at a time",
        admin_email="admin@kinggeorge.bend.community", admin_password="admin123456", admin_name="King George Admin",
        shops_data=[
            ("King George Diner", "restaurant", "9100 Kings Hwy, King George, VA", "Tom Reynolds", "tom@kgdiner.com", "540-555-1000"),
            ("Riverside Hardware", "hardware", "8700 Dahlgren Rd, King George, VA", "Sarah Blake", "sarah@riversidehw.com", "540-555-1001"),
            ("Potomac Bakery", "bakery", "9200 James Madison Pkwy, King George, VA", "Maria Santos", "maria@potomacbakery.com", "540-555-1002"),
            ("Blue Ridge Crafts", "retail", "8900 Kings Hwy, King George, VA", "David Chen", "david@blueridgecrafts.com", "540-555-1003"),
        ],
        listings_data=[
            (0, ListingType.OFFER, ListingCategory.STAFF, "Line cook needed weekends", "Looking for experienced line cook for Saturday and Sunday brunch shifts.", 22.0, False, UrgencyLevel.URGENT),
            (0, ListingType.REQUEST, ListingCategory.MATERIALS, "Fresh herbs supplier wanted", "Need regular supply of basil, thyme, and rosemary. Weekly delivery preferred.", None, True, UrgencyLevel.NORMAL),
            (1, ListingType.OFFER, ListingCategory.EQUIPMENT, "Power washer available for rent", "Commercial grade power washer. Available weekdays. Pickup only.", 45.0, False, UrgencyLevel.NORMAL),
            (1, ListingType.OFFER, ListingCategory.MATERIALS, "Surplus lumber and plywood", "200 board feet of pine lumber and 12 sheets of 3/4 inch plywood.", None, True, UrgencyLevel.URGENT),
            (2, ListingType.REQUEST, ListingCategory.STAFF, "Early morning baker needed", "Need someone who can start at 4 AM. Bread and pastry experience required.", 20.0, False, UrgencyLevel.URGENT),
            (2, ListingType.OFFER, ListingCategory.MATERIALS, "Day-old bread and pastries", "Available daily after 5 PM. Perfect for food banks or animal feed.", None, True, UrgencyLevel.NORMAL),
            (3, ListingType.REQUEST, ListingCategory.EQUIPMENT, "Need pottery kiln access", "Looking to fire ceramics. Will pay hourly rate for kiln time.", 30.0, False, UrgencyLevel.NORMAL),
            (3, ListingType.OFFER, ListingCategory.STAFF, "Art workshop instructor", "Offering weekend watercolor workshops. 2-hour sessions, materials included.", 35.0, False, UrgencyLevel.NORMAL),
        ],
        events_data=[
            dict(id=uuid4(), title="King George Farmers Market", description="Fresh local produce, artisan bread, and handmade crafts every Saturday.", start_date=datetime(2026,4,12,8,0), end_date=datetime(2026,4,12,12,0), location="King George Courthouse Green", category="market", source="manual", is_featured=True, status="active"),
            dict(id=uuid4(), title="Potomac River Cleanup Day", description="Join us for the annual river cleanup. Gloves and bags provided.", start_date=datetime(2026,4,19,9,0), end_date=datetime(2026,4,19,13,0), location="Fairview Beach", category="community", source="manual", is_featured=True, status="active"),
            dict(id=uuid4(), title="Bluegrass at the Brewery", description="Live bluegrass music with The Potomac Pickers. Food trucks on site.", start_date=datetime(2026,4,18,18,0), end_date=datetime(2026,4,18,21,0), location="King George Brewing Co.", category="music", source="manual", is_featured=False, status="active"),
            dict(id=uuid4(), title="Spring Plant Sale", description="Master Gardeners selling native plants, herbs, and vegetable starts.", start_date=datetime(2026,4,25,9,0), end_date=datetime(2026,4,25,14,0), location="King George Extension Office", category="outdoor", source="manual", is_featured=False, status="active"),
            dict(id=uuid4(), title="Kids Art in the Park", description="Free art workshop for kids ages 5-12. Painting, drawing, and sculpture.", start_date=datetime(2026,4,20,10,0), end_date=datetime(2026,4,20,12,0), location="Barnesfield Park", category="art", source="manual", is_featured=False, status="active"),
            dict(id=uuid4(), title="Local History Night", description="Presentation on the colonial history of King George County.", start_date=datetime(2026,4,22,19,0), end_date=datetime(2026,4,22,21,0), location="Smoot Library", category="historic", source="manual", is_featured=False, status="active"),
        ],
        volunteers_data=[
            dict(id=uuid4(), name="Jake Morrison", phone="540-555-2001", email="jake.morrison@example.com", skills="Landscaping, fence repair, heavy lifting", available_time="Weekends 7am-3pm"),
            dict(id=uuid4(), name="Lisa Park", phone="540-555-2002", email="lisa.park@example.com", skills="Bookkeeping, office organization, data entry", available_time="Weekday mornings"),
            dict(id=uuid4(), name="Carlos Ruiz", phone="540-555-2003", email="carlos.ruiz@example.com", skills="Cooking, food prep, serving", available_time="Flexible with notice"),
            dict(id=uuid4(), name="Amy Watson", phone="540-555-2004", email="amy.watson@example.com", skills="Teaching, tutoring, after-school programs", available_time="Mon-Fri 3pm-6pm"),
            dict(id=uuid4(), name="Brian Cole", phone="540-555-2005", email="brian.cole@example.com", skills="Plumbing, basic electrical, handyman", available_time="Saturdays only"),
        ],
        talent_data=[
            dict(id=uuid4(), name="Nicole Harper", phone="540-555-3001", email="nicole@example.com", category="musician", skills="Vocals, acoustic guitar, country, folk", available_time="Fri-Sat evenings", rate=125.0, rate_unit="gig"),
            dict(id=uuid4(), name="Marcus Wright", phone="540-555-3002", email="marcus@example.com", category="freelancer", skills="Photography, drone footage, video editing", available_time="By appointment", rate=75.0, rate_unit="hr"),
            dict(id=uuid4(), name="Diane Kowalski", phone="540-555-3003", email="diane@example.com", category="artist", skills="Oil painting, portraits, murals, restoration", available_time="Weekdays", rate=55.0, rate_unit="hr"),
            dict(id=uuid4(), name="Ray Jackson", phone="540-555-3004", email="ray@example.com", category="musician", skills="Drums, percussion, jazz combo, wedding bands", available_time="Weekends", rate=150.0, rate_unit="gig"),
            dict(id=uuid4(), name="Priya Mehta", phone="540-555-3005", email="priya@example.com", category="freelancer", skills="Web development, Shopify, social media marketing", available_time="Remote, flexible", rate=40.0, rate_unit="hr"),
        ],
    )


async def seed_new_kent():
    await _create_tenant_with_data(
        slug="new-kent", subdomain="new-kent.bend.community",
        display_name="The Bend \u2014 New Kent",
        tagline="Where Virginia heritage meets community spirit",
        about_text="New Kent County, established in 1654, is home to award-winning wineries, premier golf courses, and the historic Colonial Downs Racetrack. The Bend \u2014 New Kent connects local businesses from the Chickahominy to the Pamunkey, helping neighbors share resources and build a stronger community.",
        primary_color="hsl(28,45%,28%)", footer_text="From vineyards to rivers \u2014 one community",
        admin_email="admin@newkent.bend.community", admin_password="admin123456", admin_name="New Kent Admin",
        shops_data=[
            ("New Kent Winery & Vineyard", "retail", "8400 Old Church Rd, New Kent, VA", "Catherine Bell", "catherine@nkwinery.com", "804-555-4000"),
            ("Chickahominy Deli", "deli", "7600 New Kent Hwy, New Kent, VA", "Robert Hayes", "robert@chickdeli.com", "804-555-4001"),
            ("Colonial Downs Cafe", "cafe", "10515 Colonial Downs Pkwy, New Kent, VA", "Janet Murray", "janet@cdcafe.com", "804-555-4002"),
            ("Pamunkey River Outfitters", "service", "9100 Courthouse Rd, New Kent, VA", "Chris Lawson", "chris@pamunkeyoutfit.com", "804-555-4003"),
            ("Brickshire General Store", "retail", "8200 Brickshire Blvd, New Kent, VA", "Angela Foster", "angela@brickshire.com", "804-555-4004"),
        ],
        listings_data=[
            (0, ListingType.OFFER, ListingCategory.STAFF, "Wine tasting room host needed", "Weekend position pouring wines, guiding tastings, and managing the gift shop.", 18.0, False, UrgencyLevel.NORMAL),
            (0, ListingType.OFFER, ListingCategory.MATERIALS, "Empty wine barrels available", "15 used oak wine barrels, great for planters or decor. Free pickup.", None, True, UrgencyLevel.NORMAL),
            (1, ListingType.OFFER, ListingCategory.STAFF, "Sandwich maker \u2014 immediate start", "Need help with lunch rush Mon-Fri 10am-2pm. Will train.", 16.0, False, UrgencyLevel.URGENT),
            (2, ListingType.OFFER, ListingCategory.EQUIPMENT, "Commercial espresso machine rental", "La Marzocca 2-group. Available for events or pop-ups. Daily rate.", 75.0, False, UrgencyLevel.NORMAL),
            (2, ListingType.REQUEST, ListingCategory.STAFF, "Weekend barista wanted", "Saturday and Sunday 7am-2pm. Latte art skills a plus.", 17.0, False, UrgencyLevel.URGENT),
            (3, ListingType.OFFER, ListingCategory.EQUIPMENT, "Kayaks and canoes for group rental", "10 kayaks and 4 canoes available for group outings. Delivery included within county.", 25.0, False, UrgencyLevel.NORMAL),
            (4, ListingType.OFFER, ListingCategory.MATERIALS, "Surplus canning jars and lids", "200+ mason jars in various sizes. Perfect for preserves season.", None, True, UrgencyLevel.NORMAL),
            (4, ListingType.REQUEST, ListingCategory.EQUIPMENT, "Need portable tent for market booth", "Looking to borrow/rent a 10x10 pop-up tent for Saturday farmers markets.", 20.0, False, UrgencyLevel.URGENT),
        ],
        events_data=[
            dict(id=uuid4(), title="New Kent Farmers Market", description="Fresh produce, local honey, baked goods, and handmade crafts at the NKFM Pavilion.", start_date=datetime(2026,4,11,8,0), end_date=datetime(2026,4,11,12,0), location="NKFM Pavilion, Vineyards Pkwy", category="market", source="manual", is_featured=True, status="active"),
            dict(id=uuid4(), title="Virginia Derby Day", description="The premier horse racing event at Colonial Downs. Live races, mint juleps, and hat contests.", start_date=datetime(2026,5,16,12,0), end_date=datetime(2026,5,16,18,0), location="Colonial Downs Racetrack", category="community", source="manual", is_featured=True, status="active"),
            dict(id=uuid4(), title="Uncorked Half Marathon", description="Run through scenic vineyards with wine tastings at each mile marker.", start_date=datetime(2026,4,26,8,0), end_date=datetime(2026,4,26,14,0), location="New Kent Winery", category="outdoor", source="manual", is_featured=True, status="active"),
            dict(id=uuid4(), title="Winery Jazz Evening", description="Live jazz under the stars at Gauthier Vineyard. Bring a blanket and enjoy local wines.", start_date=datetime(2026,4,19,18,0), end_date=datetime(2026,4,19,21,0), location="Gauthier Vineyard", category="music", source="manual", is_featured=False, status="active"),
            dict(id=uuid4(), title="Historic Courthouse Tour", description="Guided tour of the 1909 courthouse and colonial-era buildings.", start_date=datetime(2026,4,20,10,0), end_date=datetime(2026,4,20,12,0), location="New Kent Courthouse Circle", category="historic", source="manual", is_featured=False, status="active"),
            dict(id=uuid4(), title="Pamunkey River Kayak Day", description="Guided 6-mile paddle down the Pamunkey. Beginners welcome. Equipment provided.", start_date=datetime(2026,4,25,9,0), end_date=datetime(2026,4,25,13,0), location="Pamunkey River Launch", category="outdoor", source="manual", is_featured=False, status="active"),
            dict(id=uuid4(), title="Kids Fishing Derby", description="Annual youth fishing competition at the lake. Ages 5-15. Prizes for biggest catch.", start_date=datetime(2026,5,2,7,0), end_date=datetime(2026,5,2,11,0), location="Rockahock Campground", category="outdoor", source="manual", is_featured=False, status="active"),
            dict(id=uuid4(), title="Spring Art & Craft Fair", description="Local artisans selling pottery, woodwork, paintings, and handmade jewelry.", start_date=datetime(2026,4,27,10,0), end_date=datetime(2026,4,27,16,0), location="New Kent Visitors Center", category="art", source="manual", is_featured=False, status="active"),
        ],
        volunteers_data=[
            dict(id=uuid4(), name="Hank Thurston", phone="804-555-5001", email="hank@example.com", skills="Carpentry, deck building, fence repair", available_time="Weekends"),
            dict(id=uuid4(), name="Megan Price", phone="804-555-5002", email="megan@example.com", skills="Event coordination, setup, cleanup", available_time="Flexible with 48hr notice"),
            dict(id=uuid4(), name="Oscar Williams", phone="804-555-5003", email="oscar@example.com", skills="Truck driving, deliveries, moving", available_time="Weekday mornings"),
            dict(id=uuid4(), name="Patty Nguyen", phone="804-555-5004", email="patty@example.com", skills="Graphic design, flyer printing, signage", available_time="Evenings after 6pm"),
            dict(id=uuid4(), name="Greg Sullivan", phone="804-555-5005", email="greg@example.com", skills="Gardening, composting, farm help", available_time="Sat-Sun 6am-noon"),
            dict(id=uuid4(), name="Rosa Jimenez", phone="804-555-5006", email="rosa@example.com", skills="Cooking, baking, catering for 50+", available_time="Weekends"),
        ],
        talent_data=[
            dict(id=uuid4(), name="Troy Masterson", phone="804-555-6001", email="troy@example.com", category="musician", skills="Banjo, guitar, Appalachian folk, bluegrass", available_time="Fri-Sun", rate=100.0, rate_unit="gig"),
            dict(id=uuid4(), name="Keiko Tanaka", phone="804-555-6002", email="keiko@example.com", category="artist", skills="Watercolor landscapes, botanical illustration, workshops", available_time="By appointment", rate=50.0, rate_unit="hr"),
            dict(id=uuid4(), name="Darnell Scott", phone="804-555-6003", email="darnell@example.com", category="freelancer", skills="Drone photography, real estate video, event coverage", available_time="Flexible", rate=200.0, rate_unit="gig"),
            dict(id=uuid4(), name="Beth Compton", phone="804-555-6004", email="beth@example.com", category="musician", skills="Fiddle, mandolin, old-time country, square dances", available_time="Weekends", rate=125.0, rate_unit="gig"),
            dict(id=uuid4(), name="Sam Okafor", phone="804-555-6005", email="sam@example.com", category="freelancer", skills="Website design, local SEO, Google Business setup", available_time="Remote, weekdays", rate=45.0, rate_unit="hr"),
            dict(id=uuid4(), name="Linda Marsh", phone="804-555-6006", email="linda@example.com", category="artist", skills="Pottery, ceramics, kiln firing, classes for adults", available_time="Tue-Sat", rate=60.0, rate_unit="hr"),
        ],
    )


async def clear_dummy_data():
    """Delete all dummy/seeded content but keep tenants and seed admin accounts.

    Preserves:
      - Tenants (westmoreland, king-george, new-kent, etc.)
      - Super admin user (super@thebend.app)
      - Community admin users (admin@thebend.app, admin@kinggeorge.bend.community,
        admin@newkent.bend.community)
      - Guidelines, ad pricing, sponsors (platform configuration)

    Deletes everything else: shops, listings, events, volunteers, talent,
    success_stories, event_connectors, notifications, messages, interests,
    saved_listings, reports, endorsements, shop_admin/employee users.
    """
    from sqlalchemy import delete, select, or_, not_
    from app.models.message import Message, MessageThread
    from app.models.notification import Notification
    from app.models.interest import Interest
    from app.models.saved_listing import SavedListing
    from app.models.report import Report
    from app.models.endorsement import Endorsement
    from app.models.guideline import Guideline
    from app.models.success_story import SuccessStory
    from app.models.listing import Listing, ListingImage

    PROTECTED_EMAILS = {
        "super@thebend.app",
        "admin@thebend.app",
        "admin@kinggeorge.bend.community",
        "admin@newkent.bend.community",
    }

    async with async_session() as session:
        # Order matters: delete dependents before parents to satisfy FK constraints
        # 1. Listing-related (interests, saved, reports, success stories, images)
        await session.execute(delete(Interest))
        await session.execute(delete(SavedListing))
        await session.execute(delete(Report))
        await session.execute(delete(SuccessStory))
        await session.execute(delete(ListingImage))

        # 2. Messaging
        await session.execute(delete(Message))
        await session.execute(delete(MessageThread))

        # 3. Notifications
        await session.execute(delete(Notification))

        # 4. Endorsements
        await session.execute(delete(Endorsement))

        # 5. Listings
        await session.execute(delete(Listing))

        # 6. Events & Connectors
        await session.execute(delete(Event))
        await session.execute(delete(EventConnector))

        # 7. Volunteers, Talent (keep Sponsors, AdPricing, Guidelines as platform config)
        await session.execute(delete(Volunteer))
        await session.execute(delete(Talent))

        # 8. Detach users from shops, then delete shops
        await session.execute(
            User.__table__.update().values(shop_id=None)
        )
        await session.execute(delete(Shop))

        # 9. Delete all users except protected seed accounts
        await session.execute(
            delete(User).where(not_(User.email.in_(PROTECTED_EMAILS)))
        )

        await session.commit()

        # Report what's left
        remaining = await session.execute(select(User.email, User.role))
        print("Cleared all dummy data. Preserved users:")
        for email, role in remaining.all():
            role_val = role.value if hasattr(role, "value") else role
            print(f"  - {email} ({role_val})")


async def main():
    await ensure_default_tenant()
    await create_super_admin()
    await create_community_admin()
    await seed_connector()
    await seed_events()
    await seed_volunteers()
    await seed_talent()
    await seed_sponsors()
    await seed_ad_pricing()
    await seed_stories()
    await sync_connector()
    # Seed additional tenants
    await seed_king_george()
    await seed_new_kent()


async def fix_logo_extensions():
    """Update sponsor logo URLs from .jpeg to .png after file rename."""
    from sqlalchemy import text
    async with async_session() as session:
        result = await session.execute(text(
            "UPDATE sponsors SET logo_url = REPLACE(logo_url, '.jpeg', '.png') "
            "WHERE logo_url LIKE '%-logo.jpeg'"
        ))
        await session.commit()
        print(f"Updated {result.rowcount} sponsor logo URLs (.jpeg -> .png)")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "clear":
        asyncio.run(clear_dummy_data())
    elif len(sys.argv) > 1 and sys.argv[1] == "fix-logos":
        asyncio.run(fix_logo_extensions())
    elif len(sys.argv) > 1:
        email = sys.argv[1]
        password = sys.argv[2] if len(sys.argv) > 2 else "admin123456"
        asyncio.run(create_community_admin(email, password))
    else:
        asyncio.run(main())
