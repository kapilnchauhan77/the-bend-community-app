"""Seed realistic sample data for The Bend Community App."""
import asyncio
from uuid import uuid4
from datetime import datetime, timedelta
from decimal import Decimal

from passlib.context import CryptContext
from sqlalchemy import select

from app.database import async_session
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.interest import Interest
from app.models.message import MessageThread, Message
from app.models.enums import (
    UserRole, ShopStatus, ListingType, ListingCategory,
    UrgencyLevel, ListingStatus,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed():
    async with async_session() as session:
        # Check if already seeded
        result = await session.execute(select(Shop).limit(1))
        if result.scalar_one_or_none():
            print("Data already seeded. Skipping.")
            return

        password_hash = pwd_context.hash("password123")
        now = datetime.utcnow()
        tomorrow = now + timedelta(days=1)

        # ------------------------------------------------------------------
        # 1. Shop admin users + shops
        # ------------------------------------------------------------------
        shop_data = [
            {
                "name": "Fresh Bites Café",
                "business_type": "restaurant",
                "owner_name": "John Doe",
                "email": "john@freshbites.com",
                "phone": "+1234567001",
            },
            {
                "name": "The Corner Grill",
                "business_type": "restaurant",
                "owner_name": "Maria Garcia",
                "email": "maria@cornergrill.com",
                "phone": "+1234567002",
            },
            {
                "name": "Mama's Kitchen",
                "business_type": "bakery",
                "owner_name": "Sarah Johnson",
                "email": "sarah@mamas.com",
                "phone": "+1234567003",
            },
            {
                "name": "Deli Plus",
                "business_type": "deli",
                "owner_name": "Tom Wilson",
                "email": "tom@deliplus.com",
                "phone": "+1234567004",
            },
            {
                "name": "Tool Hub",
                "business_type": "hardware",
                "owner_name": "Mike Chen",
                "email": "mike@toolhub.com",
                "phone": "+1234567005",
            },
        ]

        # Phase 1: create users without shop_id (shops don't exist yet)
        users = {}
        for d in shop_data:
            user = User(
                id=uuid4(),
                email=d["email"],
                password_hash=password_hash,
                name=d["owner_name"],
                phone=d["phone"],
                role=UserRole.SHOP_ADMIN,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            session.add(user)
            users[d["email"]] = user

        await session.flush()

        # Phase 2: create shops with admin_user_id set
        shops = {}
        for d in shop_data:
            user = users[d["email"]]
            shop = Shop(
                id=uuid4(),
                name=d["name"],
                business_type=d["business_type"],
                contact_phone=d["phone"],
                status=ShopStatus.ACTIVE,
                admin_user_id=user.id,
                guidelines_accepted=True,
                guidelines_accepted_at=now,
                created_at=now,
                updated_at=now,
            )
            session.add(shop)
            shops[d["name"]] = shop

        await session.flush()

        # Phase 3: link users to their shop
        for d in shop_data:
            user = users[d["email"]]
            shop = shops[d["name"]]
            user.shop_id = shop.id

        await session.flush()

        # Convenience aliases
        fresh_bites = shops["Fresh Bites Café"]
        corner_grill = shops["The Corner Grill"]
        mamas_kitchen = shops["Mama's Kitchen"]
        deli_plus = shops["Deli Plus"]
        tool_hub = shops["Tool Hub"]

        john = users["john@freshbites.com"]
        maria = users["maria@cornergrill.com"]
        sarah = users["sarah@mamas.com"]
        tom = users["tom@deliplus.com"]
        mike = users["mike@toolhub.com"]

        # ------------------------------------------------------------------
        # 2. Listings
        # ------------------------------------------------------------------
        listings_data = [
            # Urgent (high priority)
            {
                "shop": fresh_bites,
                "type": ListingType.OFFER,
                "category": ListingCategory.MATERIALS,
                "title": "Tomatoes — 5kg",
                "description": "Ripe Roma tomatoes, bought 2 days ago. Need to move before they go bad.",
                "urgency": UrgencyLevel.URGENT,
                "is_free": True,
                "price": None,
                "expiry_date": tomorrow,
            },
            {
                "shop": corner_grill,
                "type": ListingType.REQUEST,
                "category": ListingCategory.STAFF,
                "title": "Hiring: Baker for tomorrow 6 AM shift",
                "description": "Our regular baker is sick. Need someone experienced with bread and pastries for a morning shift.",
                "urgency": UrgencyLevel.URGENT,
                "is_free": False,
                "price": Decimal("25.00"),
                "expiry_date": tomorrow,
            },
            # Urgent (3)
            {
                "shop": mamas_kitchen,
                "type": ListingType.OFFER,
                "category": ListingCategory.EQUIPMENT,
                "title": "Commercial mixer available this weekend",
                "description": "KitchenAid commercial stand mixer. Available Friday through Sunday. Must pick up and return.",
                "urgency": UrgencyLevel.URGENT,
                "is_free": True,
                "price": None,
                "expiry_date": None,
            },
            {
                "shop": deli_plus,
                "type": ListingType.REQUEST,
                "category": ListingCategory.MATERIALS,
                "title": "Need 5L olive oil urgently",
                "description": "Ran out of olive oil for the weekend rush. Looking for anyone with surplus.",
                "urgency": UrgencyLevel.URGENT,
                "is_free": False,
                "price": Decimal("30.00"),
                "expiry_date": None,
            },
            {
                "shop": fresh_bites,
                "type": ListingType.OFFER,
                "category": ListingCategory.STAFF,
                "title": "Available: Experienced cashier, afternoons Mon-Wed",
                "description": "One of our cashiers has open afternoons Mon-Wed. 3 years retail experience.",
                "urgency": UrgencyLevel.URGENT,
                "is_free": False,
                "price": Decimal("18.00"),
                "expiry_date": None,
            },
            # Normal (7)
            {
                "shop": tool_hub,
                "type": ListingType.OFFER,
                "category": ListingCategory.EQUIPMENT,
                "title": "Lawnmower for weekly rental",
                "description": "Gas-powered lawnmower in great condition. Available for weekly rental to any shop on the bend.",
                "urgency": UrgencyLevel.NORMAL,
                "is_free": False,
                "price": Decimal("15.00"),
                "expiry_date": None,
            },
            {
                "shop": corner_grill,
                "type": ListingType.OFFER,
                "category": ListingCategory.MATERIALS,
                "title": "Extra bread flour — 10kg bags",
                "description": "Over-ordered flour. Have 3 bags of 10kg premium bread flour. Best before next month.",
                "urgency": UrgencyLevel.NORMAL,
                "is_free": False,
                "price": Decimal("12.00"),
                "expiry_date": None,
            },
            {
                "shop": mamas_kitchen,
                "type": ListingType.REQUEST,
                "category": ListingCategory.EQUIPMENT,
                "title": "Need industrial blender for 2 days",
                "description": "Making large batch of soups for an event. Need a heavy-duty blender for Tuesday and Wednesday.",
                "urgency": UrgencyLevel.NORMAL,
                "is_free": False,
                "price": Decimal("10.00"),
                "expiry_date": None,
            },
            {
                "shop": deli_plus,
                "type": ListingType.OFFER,
                "category": ListingCategory.STAFF,
                "title": "Available: Deli counter worker, part-time",
                "description": "We have a trained deli worker available Thursdays and Fridays. Good with customers.",
                "urgency": UrgencyLevel.NORMAL,
                "is_free": False,
                "price": Decimal("16.00"),
                "expiry_date": None,
            },
            {
                "shop": fresh_bites,
                "type": ListingType.OFFER,
                "category": ListingCategory.MATERIALS,
                "title": "Sourdough starter — free to good home",
                "description": "Active sourdough starter, been feeding it for 6 months. Makes amazing bread.",
                "urgency": UrgencyLevel.NORMAL,
                "is_free": True,
                "price": None,
                "expiry_date": None,
            },
            {
                "shop": tool_hub,
                "type": ListingType.OFFER,
                "category": ListingCategory.EQUIPMENT,
                "title": "Extra folding tables and chairs",
                "description": "We have 4 folding tables and 20 chairs available for events or busy periods. Free to borrow.",
                "urgency": UrgencyLevel.NORMAL,
                "is_free": True,
                "price": None,
                "expiry_date": None,
            },
            {
                "shop": corner_grill,
                "type": ListingType.REQUEST,
                "category": ListingCategory.STAFF,
                "title": "Hiring: 2 waitstaff for Saturday service",
                "description": "Big reservation this Saturday evening. Looking for 2 experienced waitstaff, 5 PM to 10 PM.",
                "urgency": UrgencyLevel.NORMAL,
                "is_free": False,
                "price": Decimal("20.00"),
                "expiry_date": None,
            },
        ]

        listings = []
        for d in listings_data:
            listing = Listing(
                id=uuid4(),
                shop_id=d["shop"].id,
                type=d["type"],
                category=d["category"],
                title=d["title"],
                description=d["description"],
                urgency=d["urgency"],
                is_free=d["is_free"],
                price=d["price"],
                expiry_date=d["expiry_date"],
                status=ListingStatus.ACTIVE,
                views_count=0,
                interest_count=0,
                created_at=now,
                updated_at=now,
            )
            session.add(listing)
            listings.append(listing)

        await session.flush()

        # Listing references by index (0-based)
        listing_tomatoes = listings[0]   # index 0 — Fresh Bites tomatoes
        listing_flour = listings[6]      # index 6 — Corner Grill bread flour

        # ------------------------------------------------------------------
        # 3. Interests + message threads
        # ------------------------------------------------------------------
        # Helper: create interest + thread + initial message
        async def create_interest(listing, interested_user, listing_owner, message_text):
            interest = Interest(
                id=uuid4(),
                listing_id=listing.id,
                user_id=interested_user.id,
                message=message_text,
                created_at=now,
            )
            session.add(interest)

            # Increment listing interest count
            listing.interest_count += 1

            # Create message thread
            thread = MessageThread(
                id=uuid4(),
                listing_id=listing.id,
                participant_a=interested_user.id,
                participant_b=listing_owner.id,
                last_message_at=now,
                created_at=now,
            )
            session.add(thread)
            await session.flush()

            if message_text:
                msg = Message(
                    id=uuid4(),
                    thread_id=thread.id,
                    sender_id=interested_user.id,
                    content=message_text,
                    created_at=now,
                )
                session.add(msg)

            await session.flush()

        # Maria (Corner Grill) interested in listing #1 (Tomatoes) — owner: John (Fresh Bites)
        await create_interest(listing_tomatoes, maria, john, "I can pick these up today!")

        # Tom (Deli Plus) interested in listing #1 (Tomatoes) — owner: John (Fresh Bites)
        await create_interest(listing_tomatoes, tom, john, "We could use these for our sandwiches")

        # Sarah (Mama's Kitchen) interested in listing #7 (Bread flour) — owner: Maria (Corner Grill)
        await create_interest(listing_flour, sarah, maria, "I'd love 2 bags please")

        # ------------------------------------------------------------------
        # 4. Two fulfilled historical listings
        # ------------------------------------------------------------------
        old_time = now - timedelta(days=14)
        fulfilled_time = now - timedelta(days=7)

        fulfilled_listings = [
            Listing(
                id=uuid4(),
                shop_id=fresh_bites.id,
                type=ListingType.OFFER,
                category=ListingCategory.MATERIALS,
                title="Leftover pastries — end of day",
                description="Assorted pastries from morning batch. Take them all.",
                urgency=UrgencyLevel.URGENT,
                is_free=True,
                price=None,
                status=ListingStatus.FULFILLED,
                views_count=12,
                interest_count=3,
                fulfilled_at=fulfilled_time,
                created_at=old_time,
                updated_at=fulfilled_time,
            ),
            Listing(
                id=uuid4(),
                shop_id=corner_grill.id,
                type=ListingType.REQUEST,
                category=ListingCategory.EQUIPMENT,
                title="Needed: deep fryer for the weekend",
                description="Ours broke down. Needed a replacement for Friday and Saturday service.",
                urgency=UrgencyLevel.URGENT,
                is_free=False,
                price=Decimal("20.00"),
                status=ListingStatus.FULFILLED,
                views_count=8,
                interest_count=2,
                fulfilled_at=fulfilled_time,
                created_at=old_time,
                updated_at=fulfilled_time,
            ),
        ]
        for fl in fulfilled_listings:
            session.add(fl)

        await session.commit()
        print("Seed data created successfully!")
        print(f"  - 5 shops created")
        print(f"  - 5 shop admin users created")
        print(f"  - {len(listings)} active listings created")
        print(f"  - 2 fulfilled historical listings created")
        print(f"  - 3 interests with message threads created")


if __name__ == "__main__":
    asyncio.run(seed())
